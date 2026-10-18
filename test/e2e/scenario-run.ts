// E2E の足場。起こす・開く・成果物を書く・比べる・後始末をここに置き、シナリオ
// （`test/e2e/<シナリオ>.test.ts`）はここを呼ぶだけにする。形の正典は
// `docs/architecture/testing.md`「E2E の走らせ方」「E2E の成果物と再現」。
//
// - ブラウザは1ファイルに1つ（`beforeAll`）で、`afterAll` で kill して止める。
//   tsukumo とブラウザのコンテキストは1件ごとに1つ
// - 起こした tsukumo は `afterEach` で自分の pid だけに `SIGTERM` を送り、終わるのを待ってから
//   一時のディレクトリを消す
// - 判定は DOM の構造とメッセージの列の2つの JSON だけ。スクリーンショットは目視の添え物
// - `open` は疑似セッションの予定の最初の静かな区切りまでが届いてから部屋を渡す
//
// 成果物に入るのは疑似セッション（`test/fixture/fake-session.json`）の手書きの会話だけ。
// 起動トークンと絶対パスは置き換えてから書く。

import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"

import type { Browser, Locator, Page } from "playwright-core"
import { afterAll, afterEach, beforeAll } from "vitest"

import { waitForViewUrl } from "../../scripts/shared/fake-tsukumo-process.ts"
import { PROTOCOL_VERSION } from "../../src/shared/frame.ts"
import { writeBeadsConfig } from "../fixture/beads-repository.ts"
import { ANNOUNCED_LOG, RECORD_ANNOUNCEMENTS_SCRIPT } from "./announcement-record.ts"
import {
  type ArtifactKind,
  assertNoMessagesExpected,
  matchArtifact,
  OUTPUT_ROOT,
  REPOSITORY_ROOT,
  writeArtifact,
} from "./artifact.ts"
import { launchChrome, type LaunchedChrome } from "./chrome-launch.ts"
import { type DomRootName, namedDomTreeScript, settledDom } from "./dom-tree.ts"
import { FIXED_INSTANT, installFixedClock, TIME_ZONE } from "./fixed-clock.ts"
import {
  asRecord,
  collapseCommandCatalog,
  collapsePartialUtterances,
  EVENT_TIMEOUT_MS,
  recordMessages,
  recordResponses,
} from "./message-record.ts"
import { assertNextStepGap, waitForQuietPoint } from "./scene-schedule.ts"
import { makeTempDirectory, spawnTsukumo, stopTsukumo } from "./tsukumo-process.ts"

/** 起こした tsukumo が URL を出すまで待つ上限（ミリ秒）。 */
const LAUNCH_TIMEOUT_MS = 15_000

/** `revealAfterResponse`・`revealUsageAfterTurn` が、要素が見えるまで凍らせた時計を進める1回の幅（ミリ秒）。 */
const REVEAL_CLOCK_STEP_MS = 50

/**
 * 窓の大きさ。広いほうはカタログを撮る道具の広い窓と同じ。狭い窓の積み替えを見る
 * シナリオだけ `narrow` を使う。`large` と `medium` は、領域の寸法を窓の大きさごとに測るシナリオが使う。
 * `tier-edge-medium` と `tier-edge-large` はサイドバーを柱に畳む段の境目の両側、`compact` は柱の段でやり取りの列が既定で畳まれる幅。
 * `phone` はスマホの縦の窓、`tier-edge-narrow` と `tier-edge-rail` は狭い画面の形と柱の段の境目の両側。
 */
export const VIEWPORTS = {
  wide: { width: 1400, height: 900 },
  narrow: { width: 720, height: 900 },
  phone: { width: 390, height: 844 },
  "tier-edge-narrow": { width: 760, height: 844 },
  "tier-edge-rail": { width: 761, height: 844 },
  large: { width: 1440, height: 900 },
  medium: { width: 1024, height: 768 },
  "tier-edge-medium": { width: 1100, height: 768 },
  "tier-edge-large": { width: 1101, height: 768 },
  compact: { width: 800, height: 768 },
} as const satisfies Record<string, { readonly width: number; readonly height: number }>

export type ScenarioOptions = {
  /** 成果物と期待値のファイル名（`<シナリオ>.dom.json` など）。 */
  readonly scenario: string
  /** 疑似セッションの場面の名前（`TSUKUMO_FAKE_SCENE`）。名指ししないときは `none`。 */
  readonly scene: string
  readonly viewport: keyof typeof VIEWPORTS
  /** `*.dom.json` に写す部分木の名前の並び（`docs/architecture/testing.md`「E2E の期待値の範囲」）。 */
  readonly domRoots: readonly DomRootName[]
}

/** サイドバーの使用量の目盛り（コンテキスト・プラン使用量）の口の `title`。 */
const USAGE_GAUGE_TITLES = ["コンテキスト", "プラン使用量"] as const

/** `revealAfterResponse` が応答の件数を数え始める基準。 */
export type ResponseBaseline =
  | { readonly kind: "after-act"; readonly act: () => Promise<void> }
  | { readonly kind: "all" }

/**
 * 起こして開いた1件。シナリオはこれに対して待ち・操作・判定を行う。
 * 渡した時点で、`opening` と名指しの場面の予定のうち最初の静かな区切り（`QUIET_GAP_MS`）までの手は届いている。
 */
export type ScenarioRoom = {
  readonly page: Page
  /**
   * 起こした tsukumo の cwd（`realpath` を通した絶対パス）。cwd の課題のファイルを読む
   * タスクの一覧のように、疑似セッションの場面ではなく cwd の中身そのものが元になるシナリオ
   * だけがここへ書き足す（`FAKE_BEADS_ISSUES_PATH`・`git init` など）。書き足すのは `open` が部屋を渡したあとにする。
   * 起こす前や繋がる前に用意すると、最初の見回りが `hello` に畳まれてしまい、
   * 変化を捕まえる `waitForEvent` の的が無くなる（docs/architecture/testing.md「E2E の走らせ方」）。
   */
  readonly cwd: string
  /**
   * 起こした tsukumo の `TSUKUMO_HOME`（`realpath` を通した絶対パス。テストが終わると消える）。
   * 別の窓の tsukumo の占有ファイルのように、ホームの中身そのものが元になるシナリオだけがここへ書き足す。
   * 書き足すのは `open` が部屋を渡したあとにする。
   */
  readonly home: string
  /**
   * WebSocket で `kind` のイベントが `occurrence` 回目（既定1回目）届くまで待つ（場面が流れ
   * 終わるのを時間で待たない）。同じ `kind` が場面の中で複数回流れる場合（`turn-finished` が
   * 続きのターンのたびに来るなど）に、狙った回目まで進める口。
   */
  readonly waitForEvent: (kind: string, occurrence?: number) => Promise<void>
  /**
   * `tasks-changed` が、一覧（`tasks.kind === "known"`）に `ids` をすべて含む1件まで待つ。
   * 課題のファイルを置く前の見回りは `unknown` を返しうるので、
   * `waitForEvent("tasks-changed")`（既定 occurrence=1）は狙いの一覧より前の1件で抜けうる。
   * 課題を置く足場はこちらを使う。
   */
  readonly waitForTasksContaining: (ids: readonly string[]) => Promise<void>
  /**
   * 手続き（`/rpc`）の応答で届く値から描かれる `target` を、見えるまで待つ。
   * URL に `response` を含む応答が `baseline` の基準より1件増えるまで実時間で待ってから、
   * `target` が見えるまで凍らせた時計を進める（時計を進める回数には頼らない）。
   * 基準は `after-act`（`act` を実行する前の件数）か `all`（すでに届いた応答も数える）。
   */
  readonly revealAfterResponse: (
    target: Locator,
    options: { readonly response: string; readonly baseline: ResponseBaseline },
  ) => Promise<void>
  /**
   * `turn-finished` が `occurrence` 回目に届くまで待ち、サイドバーのコンテキストとプラン使用量の目盛りが
   * どちらもそのターンの後に取った値（`data-finished-turn-count` が `occurrence`）を出して取得中でなくなるまで、凍らせた時計を進める。
   * `occurrence` を終わったターンの数として読むので、`opening` と復元でターンを終わらせない場面に限る。
   */
  readonly revealUsageAfterTurn: (occurrence: number) => Promise<void>
  /** `pending-changed` の答え待ちに `id` の札が載るまで待つ（何回目の `pending-changed` かでは待たない）。 */
  readonly waitForPending: (id: string) => Promise<void>
  /**
   * 窓の大きさを変え、窓の幅・高さが渡した値になるまで待つ。
   */
  readonly resize: (viewport: { readonly width: number; readonly height: number }) => Promise<void>
  /** 読み上げの領域（`[data-live-announcer]`）に、ページを開いてからいままでに挿入された文。 */
  readonly announced: () => Promise<readonly string[]>
  /**
   * ブラウザの時計を「凍らせた瞬間 + `elapsedMs`」で止め、DOM が落ち着くのを待ってから
   * 成果物を書き、DOM の構造だけを期待値と比べる（期待値が無ければ落とす。`E2E_UPDATE=1` なら書き直す）。
   * メッセージの列の期待値が残っていれば落とす（docs/architecture/testing.md「E2E の期待値の範囲」）。
   */
  readonly settleAndMatch: (elapsedMs: number) => Promise<void>
  /** `settleAndMatch` と同じく撮り、メッセージの列も期待値と比べる。 */
  readonly settleAndMatchWithMessages: (elapsedMs: number) => Promise<void>
}

export type ScenarioRun = {
  readonly open: (options: ScenarioOptions) => Promise<ScenarioRoom>
}

/**
 * シナリオのファイルの先頭で1回呼ぶ。ブラウザを起こす・閉じる、1件ごとの後始末を登録する。
 */
export function useScenarioRun(): ScenarioRun {
  let launching: Promise<LaunchedChrome> | undefined = undefined
  const cleanups: (() => Promise<void>)[] = []

  beforeAll(async () => {
    launching = launchChrome()
    await launching
  })

  afterEach(async () => {
    // 後から起こしたものから閉じる（コンテキスト → tsukumo → 一時のディレクトリ）。
    for (const cleanup of cleanups.splice(0).reverse()) {
      await cleanup()
    }
  })

  afterAll(async () => {
    // Chrome は普通に閉じると、最後のコンテキストを閉じてから約 10 秒たつまで終わらない。
    // beforeAll が上限で打ち切られても、起こしかけのブラウザはここで止める。
    const chrome = await launching?.catch(() => undefined)
    await chrome?.browser.close()
    await chrome?.server.kill()
  })

  return {
    open: async (options) => {
      if (launching === undefined) {
        throw new Error("ブラウザが起きていない（beforeAll が走っていない）")
      }
      return openRoom((await launching).browser, options, (cleanup) => cleanups.push(cleanup))
    },
  }
}

async function openRoom(
  browser: Browser,
  options: ScenarioOptions,
  addCleanup: (cleanup: () => Promise<void>) => void,
): Promise<ScenarioRoom> {
  const home = makeTempDirectory("tsukumo-e2e-home-")
  const cwd = makeTempDirectory("tsukumo-e2e-cwd-")
  const userHome = makeTempDirectory("tsukumo-e2e-user-home-")
  addCleanup(() => {
    rmSync(home.real, { recursive: true, force: true })
    rmSync(cwd.real, { recursive: true, force: true })
    rmSync(userHome.real, { recursive: true, force: true })
    return Promise.resolve()
  })
  writeBeadsConfig(userHome.real)

  const child = spawnTsukumo(options.scene, home.real, userHome.real, cwd.real)
  addCleanup(() => stopTsukumo(child))
  const viewUrl = await waitForViewUrl(child, LAUNCH_TIMEOUT_MS)
  const url = new URL(viewUrl)

  const context = await browser.newContext({
    viewport: VIEWPORTS[options.viewport],
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: TIME_ZONE,
    reducedMotion: "reduce",
  })
  addCleanup(() => context.close())
  const page = await context.newPage()
  await installFixedClock(page)
  await page.addInitScript(RECORD_ANNOUNCEMENTS_SCRIPT)

  const messages = recordMessages(page)
  const responses = recordResponses(page)
  await page.goto(viewUrl, { waitUntil: "domcontentloaded" })
  await waitForQuietPoint(messages, options.scene)

  let lastAwaited: { readonly kind: string; readonly occurrence: number } | undefined

  const replacements: readonly (readonly [string, string])[] = [
    // 長いものから置き換える（一時のディレクトリは互いの前置きにならないが、根は短い）。
    ...[home, cwd].flatMap((dir) => [
      [dir.real, dir === home ? "<home>" : "<cwd>"] as const,
      [dir.given, dir === home ? "<home>" : "<cwd>"] as const,
    ]),
    [REPOSITORY_ROOT, "<root>"],
    [url.searchParams.get("t") ?? "<no-token>", "<token>"],
    // ポートは `ホスト:ポート` と、ポートだけの文字（帯に出る部屋の名前）の形でだけ置き換える
    // （数字だけで当てると本文の数に当たりうる）。
    [url.host, `${url.hostname}:<port>`],
    [`"${url.port}"`, '"<port>"'],
    // 帯の主の字に出る作業ディレクトリの名前（一時ディレクトリの乱数が入る）。
    [path.basename(cwd.real), "<project>"],
    [`"protocolVersion": ${PROTOCOL_VERSION}`, '"protocolVersion": "<protocol-version>"'],
  ]

  const settleAndWrite = async (
    elapsedMs: number,
  ): Promise<{
    readonly texts: Readonly<Record<ArtifactKind, string>>
    readonly outDir: string
  }> => {
    if (lastAwaited !== undefined) {
      assertNextStepGap(options.scenario, options.scene, lastAwaited)
    }
    const outDir = path.join(OUTPUT_ROOT, options.scenario)
    mkdirSync(outDir, { recursive: true })
    // 撮る時刻へ進める前に、ターンの終わりに始まった取り直しを済ませる。
    // 済むのが進める前か後かで、取れた時刻（プラン使用量の「10:00 時点」など）が揺れる。
    await settledDom(page, options.scenario, outDir)
    await page.clock.pauseAt(Temporal.Instant.from(FIXED_INSTANT).epochMilliseconds + elapsedMs)
    await settledDom(page, options.scenario, outDir)
    const dom = await page.evaluate(namedDomTreeScript(options.domRoots))
    await page.screenshot({ path: path.join(outDir, `${options.scenario}.png`) })
    // 両方を書いてから比べる（先の比べで落ちると、控えに前の回の成果物が混ざる）。
    const texts = {
      dom: writeArtifact(options.scenario, "dom", dom, replacements, outDir),
      messages: writeArtifact(
        options.scenario,
        "messages",
        collapsePartialUtterances(collapseCommandCatalog(messages.list())),
        replacements,
        outDir,
      ),
    } satisfies Record<ArtifactKind, string>
    return { texts, outDir }
  }

  return {
    page,
    cwd: cwd.real,
    home: home.real,
    waitForEvent: async (kind, occurrence = 1) => {
      await messages.waitForEvent(kind, occurrence)
      lastAwaited = { kind, occurrence }
    },
    waitForTasksContaining: (ids) =>
      messages.waitForEventMatching("tasks-changed", (event) => {
        const tasks = asRecord(event["tasks"])
        if (tasks["kind"] !== "known") {
          return false
        }
        const items = Array.isArray(tasks["items"]) ? tasks["items"] : []
        const presentIds = new Set(items.map((item) => String(asRecord(item)["id"])))
        return ids.every((id) => presentIds.has(id))
      }),
    revealAfterResponse: async (target, { response, baseline }) => {
      const counted = await countedBefore(baseline, () => responses.count(response))
      await responses.waitForCount(response, counted + 1)
      await advanceClockUntilVisible(page, target)
    },
    revealUsageAfterTurn: async (occurrence) => {
      await messages.waitForEvent("turn-finished", occurrence)
      lastAwaited = { kind: "turn-finished", occurrence }
      for (const title of USAGE_GAUGE_TITLES) {
        await advanceClockUntilVisible(
          page,
          page.locator(
            `button[title="${title}"][data-finished-turn-count="${String(occurrence)}"]:not([aria-busy="true"])`,
          ),
        )
      }
    },
    waitForPending: (id) =>
      messages.waitForEventMatching("pending-changed", (event) =>
        Array.isArray(event["pending"])
          ? event["pending"].some((ask) => String(asRecord(ask)["id"]) === id)
          : false,
      ),
    resize: async (viewport) => {
      await page.setViewportSize(viewport)
      await page.waitForFunction(
        ({ width, height }) => window.innerWidth === width && window.innerHeight === height,
        viewport,
      )
    },
    announced: () =>
      page.evaluate((logName) => {
        const log: unknown = Reflect.get(window, logName)
        return Array.isArray(log) ? log.map(String) : []
      }, ANNOUNCED_LOG),
    settleAndMatch: async (elapsedMs) => {
      const { texts, outDir } = await settleAndWrite(elapsedMs)
      matchArtifact(options.scenario, "dom", texts.dom, outDir)
      assertNoMessagesExpected(options.scenario)
    },
    settleAndMatchWithMessages: async (elapsedMs) => {
      const { texts, outDir } = await settleAndWrite(elapsedMs)
      matchArtifact(options.scenario, "dom", texts.dom, outDir)
      matchArtifact(options.scenario, "messages", texts.messages, outDir)
    },
  }
}

/** 基準から、「これより後に届いた応答」を数え始める件数を決める。`after-act` は操作を実行してから返す。 */
async function countedBefore(
  baseline: ResponseBaseline,
  currentCount: () => number,
): Promise<number> {
  switch (baseline.kind) {
    case "after-act": {
      const count = currentCount()
      await baseline.act()
      return count
    }
    case "all":
      return 0
  }
}

/** 要素が見えるまで、凍らせた時計を進める。上限は要素を待つ時間で決め、進める回数では決めない。 */
async function advanceClockUntilVisible(page: Page, target: Locator): Promise<void> {
  const reached = target.first().waitFor({ state: "visible", timeout: EVENT_TIMEOUT_MS })
  const progress = { settled: false }
  const settle = (): void => {
    progress.settled = true
  }
  await Promise.all([
    reached,
    (async () => {
      await reached.then(settle, settle)
    })(),
    (async () => {
      while (!progress.settled) {
        await page.clock.runFor(REVEAL_CLOCK_STEP_MS)
      }
    })(),
  ])
}
