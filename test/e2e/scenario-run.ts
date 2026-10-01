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

import type { ChildProcess } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { type Browser, type BrowserServer, chromium, type Page } from "playwright-core"
import { countBy, sortBy } from "remeda"
import { afterAll, afterEach, beforeAll, expect } from "vitest"

import { spawnFakeTsukumo, waitForViewUrl } from "../../scripts/lib/fake-tsukumo-process.ts"
import {
  type FakeSessionStep,
  readFakeSession,
  startupSteps,
} from "../../src/server/session-driver/adapter/fake-driver.ts"
import { PROTOCOL_VERSION } from "../../src/shared/frame.ts"

/** サーバとブラウザの時計を凍らせる瞬間（走らせる日に依らない固定の値）。 */
const FIXED_INSTANT = "2026-01-15T01:00:00Z"

/** 両側のタイムゾーン（サーバは子プロセスの `TZ`、ブラウザはコンテキストの `timezoneId`）。 */
const TIME_ZONE = "Asia/Tokyo"

/** 走らせた結果とスクリーンショットの置き場（リポジトリの外。毎回書き直す）。 */
const OUTPUT_ROOT = "/tmp/tsukumo-e2e"

/** 期待値と食い違った回を、シナリオごとに直近何回まで `failures/` の下へ残すか。 */
const FAILURE_RETENTION_COUNT = 5

/** 期待値の置き場（リポジトリに入れる）。 */
const EXPECTED_ROOT = fileURLToPath(new URL("./expected", import.meta.url))

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")

/** 起こした tsukumo が URL を出すまで待つ上限（ミリ秒）。 */
const LAUNCH_TIMEOUT_MS = 15_000

/** 狙ったイベントが届くまで待つ上限（ミリ秒）。場面の長さ（20 秒まで）に余裕を持たせる。 */
const EVENT_TIMEOUT_MS = 30_000

/**
 * 疑似セッションの予定で、次の手までこれ以上空いた時点を静かな区切りと見なす。
 * `open` は最初の区切りまでの手を待つので、渡したあとの操作が場面のタイマーと競わない。
 * 場面の中の手の間隔（`test/fixture/fake-session.json` では 100ms 刻み）より長く、場面の区切り以下にする。
 */
const QUIET_GAP_MS = 500

/**
 * DOM の構造が落ち着いたと見なすまでの読み直しの間隔と回数。時計を止めたあとは時間で進むものが
 * 無いので、残るのは React の描き直し・素材の読み込みと、`aria-busy` が待つ本物の往復だけ。
 * 往復は時計に依らず、同じ機械で複数の `check` が重なると 5000ms を超えることがあるので、
 * 回数はその3倍にしてある。
 */
const SETTLE_INTERVAL_MS = 100
const SETTLE_ATTEMPTS = 150

/**
 * `waitForEvent` で待った手から、疑似セッションの予定の次の手までに要る最小の間合い（ミリ秒）。
 * 次の手が撮り終える前に届くと、messages に1件多く載って食い違う。
 */
const MIN_NEXT_STEP_GAP_MS = 3000

/** 期待値を書き直すか（`pnpm run test:e2e:update`）。 */
const UPDATE_EXPECTED = process.env["E2E_UPDATE"] === "1"

/**
 * 窓の大きさ。広いほうはカタログを撮る道具の広い窓と同じ。狭い窓の積み替えを見る
 * シナリオだけ `narrow` を使う。
 */
const VIEWPORTS = {
  wide: { width: 1400, height: 900 },
  narrow: { width: 720, height: 900 },
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

/** `page` はページ全体（`body` の子）。それ以外は `DOM_ROOT_SELECTORS` の根に当たる要素ごとの写し。 */
export type DomRootName = "page" | keyof typeof DOM_ROOT_SELECTORS

/** 部分木の名前から根のセレクタへの表。`class` では当てない（見た目の直しで外れる）。 */
const DOM_ROOT_SELECTORS = {
  "screen-nav": 'nav[aria-label="画面"]',
  main: '[data-region="main"]',
  sidebar: '[data-region="sidebar"]',
  character: '[data-region="character"]',
  dispatch: '[data-region="dispatch"]',
  "task-section": 'section[aria-label="タスク"]',
  "task-board": 'dialog[aria-label="タスク"]',
  "task-run-confirm": 'dialog[aria-label="タスクの実行"]',
  "session-switcher": 'dialog[aria-label="セッションを切り替える"]',
  "speech-log": 'dialog[aria-label="セリフのログ"]',
} as const satisfies Record<string, string>

/**
 * 起こして開いた1件。シナリオはこれに対して待ち・操作・判定を行う。
 * 渡した時点で、`opening` と名指しの場面の予定のうち最初の静かな区切り（`QUIET_GAP_MS`）までの手は届いている。
 */
export type ScenarioRoom = {
  readonly page: Page
  /**
   * 起こした tsukumo の cwd（`realpath` を通した絶対パス）。`main` の develop/task/ を読む
   * タスクの一覧のように、疑似セッションの場面ではなく cwd の中身そのものが元になるシナリオ
   * だけがここへ書き足す（`git init` など）。書き足すのは `open` が部屋を渡したあとにする。
   * 起こす前や繋がる前に用意すると、最初の見回りが `hello` に畳まれてしまい、
   * 変化を捕まえる `waitForEvent` の的が無くなる（docs/architecture/testing.md「E2E の走らせ方」）。
   */
  readonly cwd: string
  /**
   * WebSocket で `kind` のイベントが `occurrence` 回目（既定1回目）届くまで待つ（場面が流れ
   * 終わるのを時間で待たない）。同じ `kind` が場面の中で複数回流れる場合（`turn-finished` が
   * 続きのターンのたびに来るなど）に、狙った回目まで進める口。
   */
  readonly waitForEvent: (kind: string, occurrence?: number) => Promise<void>
  /**
   * ブラウザの時計を「凍らせた瞬間 + `elapsedMs`」で止め、DOM が落ち着くのを待ってから
   * 成果物を書き、期待値と比べる（期待値が無ければ落とす。`E2E_UPDATE=1` なら書き直す）。
   */
  readonly settleAndMatch: (elapsedMs: number) => Promise<void>
}

export type ScenarioRun = {
  readonly open: (options: ScenarioOptions) => Promise<ScenarioRoom>
}

/**
 * シナリオのファイルの先頭で1回呼ぶ。ブラウザを起こす・閉じる、1件ごとの後始末を登録する。
 */
export function useScenarioRun(): ScenarioRun {
  let chrome: LaunchedChrome | undefined = undefined
  const cleanups: (() => Promise<void>)[] = []

  beforeAll(async () => {
    chrome = await launchChrome()
  })

  afterEach(async () => {
    // 後から起こしたものから閉じる（コンテキスト → tsukumo → 一時のディレクトリ）。
    for (const cleanup of cleanups.splice(0).reverse()) {
      await cleanup()
    }
  })

  afterAll(async () => {
    // Chrome は普通に閉じると、最後のコンテキストを閉じてから約 10 秒たつまで終わらない。
    await chrome?.browser.close()
    await chrome?.server.kill()
  })

  return {
    open: async (options) => {
      if (chrome === undefined) {
        throw new Error("ブラウザが起きていない（beforeAll が走っていない）")
      }
      return openRoom(chrome.browser, options, (cleanup) => cleanups.push(cleanup))
    },
  }
}

type LaunchedChrome = {
  readonly server: BrowserServer
  /** `server` に繋いだ側。`close` は切断だけで、Chrome は止めない。 */
  readonly browser: Browser
}

async function launchChrome(): Promise<LaunchedChrome> {
  const server = await launchChromeServer()
  try {
    return { server, browser: await chromium.connect(server.wsEndpoint()) }
  } catch (error) {
    await server.kill()
    throw error
  }
}

async function launchChromeServer(): Promise<BrowserServer> {
  try {
    return await chromium.launchServer({ channel: "chrome", headless: true })
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error)
    throw new Error(
      `E2E には手元の Chrome が要る（playwright-core の channel "chrome" で起こせなかった）: ${String(reason)}`,
      { cause: error },
    )
  }
}

async function openRoom(
  browser: Browser,
  options: ScenarioOptions,
  addCleanup: (cleanup: () => Promise<void>) => void,
): Promise<ScenarioRoom> {
  const home = makeTempDirectory("tsukumo-e2e-home-")
  const cwd = makeTempDirectory("tsukumo-e2e-cwd-")
  addCleanup(() => {
    rmSync(home.real, { recursive: true, force: true })
    rmSync(cwd.real, { recursive: true, force: true })
    return Promise.resolve()
  })

  const child = spawnTsukumo(options.scene, home.real, cwd.real)
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

  const messages = recordMessages(page)
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
    [`"protocolVersion": ${PROTOCOL_VERSION}`, '"protocolVersion": "<protocol-version>"'],
  ]

  return {
    page,
    cwd: cwd.real,
    waitForEvent: async (kind, occurrence = 1) => {
      await messages.waitForEvent(kind, occurrence)
      lastAwaited = { kind, occurrence }
    },
    settleAndMatch: async (elapsedMs) => {
      if (lastAwaited !== undefined) {
        assertNextStepGap(options.scenario, options.scene, lastAwaited)
      }
      const outDir = path.join(OUTPUT_ROOT, options.scenario)
      mkdirSync(outDir, { recursive: true })
      // 撮る時刻へ進める前に、ターンの終わりに始まった取り直しを済ませる。
      // 済むのが進める前か後かで、取れた時刻（利用枠の「10:00 時点」など）が揺れる。
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
          collapsePartialUtterances(messages.list()),
          replacements,
          outDir,
        ),
      } satisfies Record<ArtifactKind, string>
      matchArtifact(options.scenario, "dom", texts.dom, outDir)
      matchArtifact(options.scenario, "messages", texts.messages, outDir)
    },
  }
}

/**
 * fake driver が流し始める予定（`startupSteps`）を読み、最初の静かな区切りまでの手が
 * 種別ごとの回数ですべて届くまで待つ。区切りは予定の時刻だけから決まり、走らせる速さに依らない。
 */
async function waitForQuietPoint(messages: MessageRecord, scene: string): Promise<void> {
  const session = readFakeSession()
  if (session === undefined) {
    throw new Error("疑似セッション（test/fixture/fake-session.json）が読めない")
  }
  const counts = countBy(
    stepsThroughQuietPoint(startupSteps(session, scene)),
    (step) => step.event.kind,
  )
  for (const [kind, count] of Object.entries(counts)) {
    await messages.waitForEvent(kind, count)
  }
}

/**
 * `waitForEvent(kind, occurrence)` が待った手から、疑似セッションの予定の次の手までの間合いを検査する。
 * `scene: "none"` は依頼のたびに `turns[]` から動的に選ばれる場面なので、ここでは検査しない
 * （fake driver の `playNextTurn`）。待った手が予定に見当たらないとき（UI の操作で生まれる手を
 * 待った場合など）も検査しない。
 */
function assertNextStepGap(
  scenario: string,
  scene: string,
  waited: { readonly kind: string; readonly occurrence: number },
): void {
  if (scene === "none") {
    return
  }
  const session = readFakeSession()
  if (session === undefined) {
    throw new Error("疑似セッション（test/fixture/fake-session.json）が読めない")
  }
  const ordered = sortBy(startupSteps(session, scene), (step) => step.afterMs)
  let seen = 0
  for (const [index, step] of ordered.entries()) {
    if (step.event.kind !== waited.kind) {
      continue
    }
    seen += 1
    if (seen !== waited.occurrence) {
      continue
    }
    const next = ordered[index + 1]
    if (next === undefined) {
      return
    }
    const gap = next.afterMs - step.afterMs
    if (gap < MIN_NEXT_STEP_GAP_MS) {
      throw new Error(
        `${scenario}（場面 ${scene}）は ${waited.kind} の${String(waited.occurrence)}回目から次の手（${next.event.kind}）まで ${String(gap)}ms しかない（${String(MIN_NEXT_STEP_GAP_MS)}ms 要る）。場面を分けて、撮り終えるまで次の手が来ない形にする`,
      )
    }
    return
  }
}

/** 時刻の順に並べた予定を、次の手まで `QUIET_GAP_MS` 以上空く最初の手まで切り出す。 */
function stepsThroughQuietPoint(steps: readonly FakeSessionStep[]): readonly FakeSessionStep[] {
  const ordered = sortBy(steps, (step) => step.afterMs)
  const quietIndex = ordered.findIndex(
    (step, index) => (ordered[index + 1]?.afterMs ?? Infinity) - step.afterMs >= QUIET_GAP_MS,
  )
  return ordered.slice(0, quietIndex + 1)
}

type TempDirectory = {
  /** `realpath` を通したパス（macOS では `/private/var/...`）。子プロセスにはこちらを渡す。 */
  readonly real: string
  /** `mkdtemp` が返したままのパス（`/var/...`）。成果物に出たときに両方を置き換える。 */
  readonly given: string
}

function makeTempDirectory(prefix: string): TempDirectory {
  const given = mkdtempSync(path.join(tmpdir(), prefix))
  return { given, real: realpathSync(given) }
}

/**
 * fake driver で tsukumo を1つ起こす。親の `TSUKUMO_` で始まる変数は外してから渡す
 * （手元で立てている値で結果が変わらないように）。キャラクターは指定せず、空のホームで同梱の
 * 既定を使う。
 */
function spawnTsukumo(scene: string, home: string, cwd: string): ChildProcess {
  return spawnFakeTsukumo({
    entry: path.join(REPOSITORY_ROOT, "src", "cli.ts"),
    cwd,
    scene: scene === "none" ? undefined : scene,
    port: 0,
    home,
    extraEnv: { TSUKUMO_FIXED_CLOCK: FIXED_INSTANT, TZ: TIME_ZONE },
    dropInheritedTsukumoEnv: true,
    stderr: "pipe",
  })
}

/** 起こした pid だけに `SIGTERM` を送り、終わるのを待つ（広いパターンで止めない）。 */
function stopTsukumo(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    child.once("exit", () => {
      resolve()
    })
    child.kill("SIGTERM")
  })
}

/**
 * ブラウザの時計を凍らせた瞬間から始める。`page.clock.install` だけでは `pauseAt` を
 * 呼ぶまで実時間で進み、止まったサーバの時計（`TSUKUMO_FIXED_CLOCK`）とずれて、
 * `SUCCESS_MOTION_WINDOW_MS` のような時間の窓の判定が実行の速さで揺れる。
 *
 * `page.clock.install` は `Date.now()` を差し替えるが `Temporal.Now` は差し替えないので、
 * `Temporal.Now.instant()` を `Date.now()` に従わせる（ブラウザで「いま」を読むのは
 * `nowEpochMilliseconds` の1つだけで、そこが呼ぶのはこれだけ）。差し込む台本は
 * 文字列で渡す——ページの中で動くコードで、このファイルの型と lint の対象にしない。
 */
async function installFixedClock(page: Page): Promise<void> {
  const fixed = Temporal.Instant.from(FIXED_INSTANT).epochMilliseconds
  // install から pauseAt までに時計が実時間で進むので、同じ時刻で install すると
  // pauseAt(fixed) が過去を指して投げる。手前で install して fixed へ進めて止める。
  await page.clock.install({ time: fixed - 1000 })
  await page.clock.pauseAt(fixed)
  await page.addInitScript(
    "Temporal.Now.instant = () => Temporal.Instant.fromEpochMilliseconds(Date.now())",
  )
}

/** 購読の手続きの経路（oRPC の要求の `u`）。 */
const FRAME_SUBSCRIBE_URL = "/frame/subscribe"

/** oRPC の封筒で、Event Iterator の1件を表す種別（`@orpc/standard-server-peer` の `MessageType`）。 */
const EVENT_ITERATOR_MESSAGE = 3

type MessageRecord = {
  readonly list: () => readonly unknown[]
  readonly waitForEvent: (kind: string, occurrence?: number) => Promise<void>
}

/**
 * WebSocket で送ったコマンドと受け取ったフレームを、届いた順に並べる
 * （`docs/architecture/testing.md`「E2E の成果物と再現」の畳み方）。
 */
function recordMessages(page: Page): MessageRecord {
  const entries: unknown[] = []
  // 手続きの要求番号（oRPC の `i`）は送るたびに変わるので、送った順の番号に置き換える。
  const requestOrders = new Map<string, number>()
  const orderOf = (rawId: unknown): number => {
    const key = String(rawId)
    const order = requestOrders.get(key) ?? requestOrders.size + 1
    requestOrders.set(key, order)
    return order
  }
  // 種別ごとに届いた回数（同じ `kind` が場面の中で複数回流れるものを、狙った回目まで待つため）。
  const counts = new Map<string, number>()
  const waiters: {
    readonly kind: string
    readonly target: number
    readonly resolve: () => void
  }[] = []

  // 押し出しの購読（`frame.subscribe`）の要求番号。購読はコマンドではないので列に載せず、
  // その Event Iterator の中身（`t: 3` の `message`）をフレームとしてほどく。
  const subscriptionIds = new Set<string>()

  const receive = (payload: string): void => {
    const envelope = parseRecord(payload)
    if (subscriptionIds.has(String(envelope["i"]))) {
      const message = asRecord(envelope["p"])
      if (envelope["t"] === EVENT_ITERATOR_MESSAGE && message["e"] === "message") {
        receiveFrame(asRecord(asRecord(message["d"])["json"]))
      }
      return
    }
    // 購読のほかに届くのはコマンドの手続きの応答（oRPC の封筒）。状態コードは 200 のとき省かれる。
    if ("i" in envelope) {
      const response = asRecord(envelope["p"])
      entries.push({
        received: "response",
        order: orderOf(envelope["i"]),
        status: response["s"] ?? 200,
        body: response["b"],
      })
    }
  }

  const receiveFrame = (frame: Readonly<Record<string, unknown>>): void => {
    switch (frame["type"]) {
      case "hello":
        entries.push({ received: "hello", protocolVersion: frame["protocolVersion"] })
        break
      case "events": {
        const events = Array.isArray(frame["events"]) ? frame["events"] : []
        for (const stamped of events) {
          const record = asRecord(stamped)
          const event = asRecord(record["event"])
          entries.push({ received: "event", at: record["at"], event: trimEvent(event) })
          const kind = String(event["kind"])
          const nextCount = (counts.get(kind) ?? 0) + 1
          counts.set(kind, nextCount)
          for (const waiter of waiters.filter(
            (candidate) => candidate.kind === kind && nextCount >= candidate.target,
          )) {
            waiter.resolve()
          }
        }
        break
      }
      case "refresh":
        break
      default:
        entries.push({ received: frame["type"], frame })
    }
  }

  // 送るのは手続きの要求（`{ i, p: { u: "/<機能>/<手続き>", b: { json } } }`）。購読の要求だけは
  // 番号を覚えて列に載せない。
  const send = (payload: string): void => {
    const request = parseRecord(payload)
    const body = asRecord(asRecord(request["p"])["b"])
    const url = asRecord(request["p"])["u"]
    if (url === FRAME_SUBSCRIBE_URL) {
      subscriptionIds.add(String(request["i"]))
      return
    }
    entries.push({
      sent: typeof url === "string" ? url.replace(/^\//, "").replaceAll("/", ".") : request,
      order: orderOf(request["i"]),
      input: body["json"],
    })
  }

  page.on("websocket", (socket) => {
    socket.on("framereceived", (frame) => {
      receive(String(frame.payload))
    })
    socket.on("framesent", (frame) => {
      send(String(frame.payload))
    })
  })

  return {
    list: () => [...entries],
    waitForEvent: (kind, occurrence = 1) => {
      if ((counts.get(kind) ?? 0) >= occurrence) {
        return Promise.resolve()
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `イベント ${kind} の${String(occurrence)}回目が届かない（${String(EVENT_TIMEOUT_MS)}ms）`,
            ),
          )
        }, EVENT_TIMEOUT_MS)
        waiters.push({
          kind,
          target: occurrence,
          resolve: () => {
            clearTimeout(timer)
            resolve()
          },
        })
      })
    },
  }
}

/**
 * 連なる `partial-utterance` を1件に畳む（`joinPartialUtterances` と同じ
 * 畳み方だが、束の切れ目そのもの——サーバ側の束ねと `test/fixture/fake-session.json` の
 * `afterMs` が同じ時刻に重なると、どちらのタイマーが先に走るかで束の切れ目が走らせるたびに
 * 変わる（`docs/architecture/testing.md`「E2E の成果物と再現」）——を比べる前に消すためにここでも行う。
 * 消えるのは切れ目の位置だけで、他の種別との並びは変えない。
 */
function collapsePartialUtterances(entries: readonly unknown[]): readonly unknown[] {
  return entries.reduce<readonly unknown[]>((collapsed, entry) => {
    const previousText = partialUtteranceText(collapsed[collapsed.length - 1])
    const currentText = partialUtteranceText(entry)
    if (previousText === undefined || currentText === undefined) {
      return [...collapsed, entry]
    }
    return [
      ...collapsed.slice(0, -1),
      {
        ...asRecord(entry),
        event: { kind: "partial-utterance", text: previousText + currentText },
      },
    ]
  }, [])
}

/** `partial-utterance` の `text`。それ以外の並び（`received: "event"` でないものを含む）は `undefined`。 */
function partialUtteranceText(entry: unknown): string | undefined {
  const record = asRecord(entry)
  const event = asRecord(record["event"])
  const text = event["text"]
  return record["received"] === "event" &&
    event["kind"] === "partial-utterance" &&
    typeof text === "string"
    ? text
    : undefined
}

/**
 * `character-changed` はいまのパックの名前と表情だけを残す（同梱のパックの一覧はパックを直す
 * たびに変わり、シナリオが確かめたいことではない）。
 */
function trimEvent(event: Readonly<Record<string, unknown>>): unknown {
  if (event["kind"] === "character-changed") {
    return { kind: event["kind"], pack: event["pack"], expressions: event["expressions"] }
  }
  return event
}

function parseRecord(payload: string): Readonly<Record<string, unknown>> {
  return asRecord(JSON.parse(payload))
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}
}

/**
 * DOM の構造を読み、2回続けて同じになるまで読み直す（時計は止めてあるので、残るのは描き直しと
 * 素材の読み込みだけ）。
 * 2回同じでも `aria-busy="true"` の要素が残っている間は落ち着いたと見なさない（取得中の表示は文字が変わらない）。
 * 落ち着かずに投げるときは、最後の2回の読みの差分を `outDir/<scenario>.settle-diff.txt` に残す。
 */
async function settledDom(page: Page, scenario: string, outDir: string): Promise<void> {
  let previous = JSON.stringify(await page.evaluate(DOM_TREE_SCRIPT))
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    await page.waitForTimeout(SETTLE_INTERVAL_MS)
    // 止めた時計では、取得の結果を画面へ知らせるごく短い setTimeout も眠ったままになる
    // （React Query の通知など。0ms 進めるだけでは起きない回がある）。
    // 取得中の印が残るあいだだけ 1ms 進めて起こす。
    if (await page.evaluate(HAS_BUSY_ELEMENT_SCRIPT)) {
      await page.clock.runFor(1)
    }
    const current = JSON.stringify(await page.evaluate(DOM_TREE_SCRIPT))
    if (current === previous && !(await page.evaluate(HAS_BUSY_ELEMENT_SCRIPT))) {
      return
    }
    if (attempt === SETTLE_ATTEMPTS - 1) {
      const diff = diffDomTrees(JSON.parse(previous), JSON.parse(current))
      const busyHints = await page.evaluate<readonly string[]>(BUSY_ELEMENT_HINTS_SCRIPT)
      const diffPath = path.join(outDir, `${scenario}.settle-diff.txt`)
      writeFileSync(diffPath, `${settleDiffText(diff, busyHints)}\n`, "utf8")
      throw new Error(
        `DOM が落ち着かない（${String(SETTLE_INTERVAL_MS * SETTLE_ATTEMPTS)}ms）。最後の2回の差分: ${path.relative(REPOSITORY_ROOT, diffPath)}\n${diff.slice(0, 5).join("\n")}`,
      )
    }
    previous = current
  }
  throw new Error(`DOM が落ち着かない（${String(SETTLE_INTERVAL_MS * SETTLE_ATTEMPTS)}ms）`)
}

/** `settle-diff.txt` の本文。差分に加え、投げた時点で `aria-busy="true"` だった要素の手がかりを残す。 */
function settleDiffText(diff: readonly string[], busyHints: readonly string[]): string {
  const diffText = diff.length === 0 ? "(差分なし。最後の2回のあいだで落ち着いた)" : diff.join("\n")
  const busyText =
    busyHints.length === 0
      ? `aria-busy="true" の要素: (無し)`
      : `aria-busy="true" の要素:\n${busyHints.join("\n")}`
  return `${diffText}\n\n${busyText}`
}

const HAS_BUSY_ELEMENT_SCRIPT = `document.querySelector('[aria-busy="true"]') !== null`

/** 投げた時点で `aria-busy="true"` の各要素を、`aria-label`・役割・タグ名・class のうち分かる手がかりで表す。 */
const BUSY_ELEMENT_HINTS_SCRIPT = `(() => {
  return Array.from(document.querySelectorAll('[aria-busy="true"]')).map((element) => {
    const label = element.getAttribute("aria-label")
    const role = element.getAttribute("role")
    const tag = element.tagName.toLowerCase()
    const className = element.getAttribute("class")
    const hints = [
      label ? \`aria-label="\${label}"\` : undefined,
      role ? \`role="\${role}"\` : undefined,
      \`tag=\${tag}\`,
      className ? \`class="\${className}"\` : undefined,
    ].filter((hint) => hint !== undefined)
    return hints.join(" ")
  })
})()`

/** 差分の1件に出す値の長さの上限と、書き出す件数の上限。 */
const DIFF_VALUE_LENGTH_LIMIT = 80
const DIFF_LINE_LIMIT = 40

/** 2つの DOM の木を葉までのパスで比べ、値が変わった・無くなった・増えたパスを返す。 */
function diffDomTrees(previous: unknown, current: unknown): readonly string[] {
  const previousLeaves = new Map(toLeaves(previous, "$"))
  const currentLeaves = new Map(toLeaves(current, "$"))
  return [...new Set([...previousLeaves.keys(), ...currentLeaves.keys()])]
    .filter((leafPath) => previousLeaves.get(leafPath) !== currentLeaves.get(leafPath))
    .slice(0, DIFF_LINE_LIMIT)
    .map(
      (leafPath) =>
        `${leafPath}: ${truncateForDiff(previousLeaves.get(leafPath))} -> ${truncateForDiff(currentLeaves.get(leafPath))}`,
    )
}

function truncateForDiff(value: string | undefined): string {
  if (value === undefined) {
    return "(無し)"
  }
  return value.length > DIFF_VALUE_LENGTH_LIMIT
    ? `${value.slice(0, DIFF_VALUE_LENGTH_LIMIT)}…`
    : value
}

function toLeaves(value: unknown, atPath: string): readonly (readonly [string, string])[] {
  if (Array.isArray(value)) {
    return value.length === 0
      ? [[atPath, "[]"]]
      : value.flatMap((item, index) => toLeaves(item, `${atPath}[${String(index)}]`))
  }
  if (typeof value === "object" && value !== null) {
    const record = asRecord(value)
    const keys = Object.keys(record)
    return keys.length === 0
      ? [[atPath, "{}"]]
      : keys.flatMap((key) => toLeaves(record[key], `${atPath}.${key}`))
  }
  return [[atPath, JSON.stringify(value)]]
}

/**
 * DOM の木を組む台本の共通部分（ページの中で動く）。残すもの・落とすものは
 * `docs/architecture/testing.md`「E2E の成果物と再現」のとおり。文字列で渡すのは `installFixedClock` と
 * 同じ理由（ページの中のコードで、このファイルの型と lint の対象にしない）。`nodeOf(element)` が
 * 1要素を写す（隠れていれば空の並び）、`childrenOf(element)` がその子を並べる。
 */
const DOM_TREE_HELPERS_SCRIPT = `
  const ID_REFERENCE = new Set([
    "aria-controls", "aria-labelledby", "aria-describedby", "aria-owns",
    "aria-activedescendant", "aria-details", "aria-errormessage", "aria-flowto",
  ]);
  const SKIPPED = new Set(["script", "style", "template", "noscript", "link", "meta"]);
  const OPAQUE = new Set(["svg", "canvas"]);
  const collapse = (text) => text.replace(/\\s+/g, " ").trim();
  const localPath = (value) => {
    const resolved = new URL(value, location.href);
    return resolved.origin === location.origin
      ? resolved.pathname + resolved.search + resolved.hash
      : resolved.href;
  };
  const visible = (element) =>
    getComputedStyle(element).display === "contents" || element.checkVisibility();
  const attributesOf = (element, tag) => {
    const kept = {};
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name;
      if (name === "role" || name.startsWith("data-") ||
          (name.startsWith("aria-") && !ID_REFERENCE.has(name))) {
        kept[name] = attribute.value;
      }
    }
    if (OPAQUE.has(tag)) {
      for (const name of Object.keys(kept)) {
        if (!name.startsWith("data-")) delete kept[name];
      }
      return kept;
    }
    if (element.hasAttribute("type")) kept.type = element.getAttribute("type");
    if ("disabled" in element && element.disabled === true) kept.disabled = true;
    if (tag === "input" && (element.type === "checkbox" || element.type === "radio")) {
      kept.checked = element.checked;
    }
    if (tag === "input" || tag === "textarea" || tag === "select") kept.value = element.value;
    if ((tag === "details" || tag === "dialog") && element.open) kept.open = true;
    if (element.hasAttribute("href")) kept.href = localPath(element.getAttribute("href"));
    if (tag === "img") {
      kept.alt = element.getAttribute("alt") ?? "";
      if (element.hasAttribute("src")) kept.src = new URL(element.getAttribute("src"), location.href).pathname;
    }
    if (tag === "time" && element.dateTime !== "") kept.dateTime = element.dateTime;
    return kept;
  };
  const childrenOf = (element) => {
    const children = [];
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = collapse(node.textContent ?? "");
        if (text !== "") children.push(text);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        children.push(...nodeOf(node));
      }
    }
    return children;
  };
  // マークダウンエディタ（CodeMirror）は中の行の分け方と自動の class を写さず、文面だけを textarea の value のように残す。
  const editorNodeOf = (element) => {
    const lines = Array.from(element.querySelectorAll(".cm-line"), (line) =>
      Array.from(line.childNodes)
        .filter((node) => !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains("cm-placeholder")))
        .map((node) => node.textContent ?? "")
        .join(""),
    );
    return [{ tag: element.localName, attributes: { editor: "codemirror", value: lines.join("\\n") } }];
  };
  const nodeOf = (element) => {
    const tag = element.localName;
    if (SKIPPED.has(tag) || !visible(element)) return [];
    if (element.classList.contains("cm-editor")) return editorNodeOf(element);
    const attributes = attributesOf(element, tag);
    const children = OPAQUE.has(tag) || tag === "textarea" ? [] : childrenOf(element);
    if ((tag === "div" || tag === "span") && Object.keys(attributes).length === 0) {
      return children;
    }
    const node = { tag };
    if (Object.keys(attributes).length > 0) node.attributes = attributes;
    if (children.length > 0) node.children = children;
    return [node];
  };
`

/** ページ全体（`document.body` の子）を写す台本。落ち着いたかどうかの判定にも使う（範囲を絞らない）。 */
const DOM_TREE_SCRIPT = `(() => {
${DOM_TREE_HELPERS_SCRIPT}
  return childrenOf(document.body);
})()`

/**
 * `options.domRoots` が選んだ名前ごとに、`DOM_ROOT_SELECTORS` の根に当たる要素（文書順）を写す台本。
 * `page` は `document.body` の子、それ以外は当たった要素ごとの `nodeOf` の結果を並べる
 * （当たらない・隠れていれば空の並び）。
 */
function namedDomTreeScript(domRoots: readonly DomRootName[]): string {
  return `(() => {
${DOM_TREE_HELPERS_SCRIPT}
  const rootSelectors = ${JSON.stringify(DOM_ROOT_SELECTORS)};
  const domRoots = ${JSON.stringify(domRoots)};
  const result = {};
  for (const name of domRoots) {
    result[name] = name === "page"
      ? childrenOf(document.body)
      : Array.from(document.querySelectorAll(rootSelectors[name])).flatMap((element) => nodeOf(element));
  }
  return result;
})()`
}

type ArtifactKind = "dom" | "messages"

/**
 * 成果物を書き、書いた文字列を返す。書く前に置き換え（絶対パス・トークン・ポート）を通す。
 */
function writeArtifact(
  scenario: string,
  kind: ArtifactKind,
  value: unknown,
  replacements: readonly (readonly [string, string])[],
  outDir: string,
): string {
  const text = `${replaceAll(JSON.stringify(value, undefined, 2), replacements)}\n`
  writeFileSync(path.join(outDir, `${scenario}.${kind}.json`), text, "utf8")
  return text
}

/**
 * 書いた成果物を期待値と比べる。期待値が無ければ落とす（黙って書かない）。
 * `E2E_UPDATE=1` なら期待値を書き直す。
 */
function matchArtifact(scenario: string, kind: ArtifactKind, text: string, outDir: string): void {
  const fileName = `${scenario}.${kind}.json`
  const expectedPath = path.join(EXPECTED_ROOT, fileName)
  if (UPDATE_EXPECTED) {
    mkdirSync(EXPECTED_ROOT, { recursive: true })
    writeFileSync(expectedPath, text, "utf8")
    return
  }
  if (!existsSync(expectedPath)) {
    throw new Error(
      `期待値が無い: ${path.relative(REPOSITORY_ROOT, expectedPath)}（pnpm run test:e2e:update で書き、git diff で中身を確かめる）`,
    )
  }
  const expectedText = readFileSync(expectedPath, "utf8")
  try {
    expect(JSON.parse(text)).toEqual(JSON.parse(expectedText))
  } catch (error) {
    const failureDir = recordFailure(scenario, outDir)
    writeFileSync(path.join(failureDir, `${scenario}.${kind}.expected.json`), expectedText, "utf8")
    writeFileSync(
      path.join(failureDir, `${scenario}.${kind}.diff.txt`),
      lineDiff(expectedText, text),
      "utf8",
    )
    throw new Error(`${kind} が期待値と食い違った。その回の成果物と差分を残した: ${failureDir}`, {
      cause: error,
    })
  }
}

function replaceAll(text: string, replacements: readonly (readonly [string, string])[]): string {
  return replacements.reduce((current, [from, to]) => current.split(from).join(to), text)
}

/**
 * 期待値と食い違った回の `outDir`（DOM・メッセージの列・スクリーンショット）を、あとで通った
 * 回に上書きされない場所へコピーし、シナリオごとに直近 `FAILURE_RETENTION_COUNT` 回だけ残す。
 */
function recordFailure(scenario: string, outDir: string): string {
  // `outDir`（`OUTPUT_ROOT/<シナリオ>/`）の外に置く。中に置くと、この回のコピーが
  // 自分自身を含んでしまう。
  const failuresRoot = path.join(OUTPUT_ROOT, "failures", scenario)
  const stamp = Temporal.Now.instant().toString().replaceAll(":", "-")
  const failureDir = path.join(failuresRoot, stamp)
  mkdirSync(failureDir, { recursive: true })
  for (const name of readdirSync(outDir)) {
    cpSync(path.join(outDir, name), path.join(failureDir, name))
  }
  pruneOldFailures(failuresRoot, stamp)
  return failureDir
}

function pruneOldFailures(failuresRoot: string, keptStamp: string): void {
  const stamps = readdirSync(failuresRoot)
    .filter((name) => name !== keptStamp)
    .sort()
  const overflow = stamps.length - (FAILURE_RETENTION_COUNT - 1)
  for (const stamp of stamps.slice(0, Math.max(overflow, 0))) {
    rmSync(path.join(failuresRoot, stamp), { recursive: true, force: true })
  }
}

/**
 * 期待値と実際の行の共通の前後を落とし、食い違った真ん中だけを `-`/`+` で並べる。JSON を
 * 整形して比べているので、局所的な食い違いなら読める差分になる。
 */
function lineDiff(expectedText: string, actualText: string): string {
  const expectedLines = expectedText.split("\n")
  const actualLines = actualText.split("\n")
  let prefix = 0
  while (
    prefix < expectedLines.length &&
    prefix < actualLines.length &&
    expectedLines[prefix] === actualLines[prefix]
  ) {
    prefix += 1
  }
  let expectedEnd = expectedLines.length
  let actualEnd = actualLines.length
  while (
    expectedEnd > prefix &&
    actualEnd > prefix &&
    expectedLines[expectedEnd - 1] === actualLines[actualEnd - 1]
  ) {
    expectedEnd -= 1
    actualEnd -= 1
  }
  return [
    `@@ ${String(prefix + 1)} 行目から`,
    ...expectedLines.slice(prefix, expectedEnd).map((line) => `- ${line}`),
    ...actualLines.slice(prefix, actualEnd).map((line) => `+ ${line}`),
  ].join("\n")
}
