// 配信中のビューをヘッドレスの Chrome で開き、画像に撮って、指定した要素の位置と大きさを
// 数値で出す。描画に関わる変更の `evidence`（`docs/architecture/testing.md`「手で確かめること」）を
// 作るための道具で、tsukumo 本体からは呼ばれないので scripts/ に置く。
//
// Playwright の headless shell を使う。無い環境では起動に失敗するので
// `pnpm exec playwright-core install chromium-headless-shell` で入れる。製品版の Google Chrome
// （`channel: "chrome"`）は起こすたびにキーチェーンへ鍵を足すので使わない。
//
// fake driver（`TSUKUMO_DRIVER=fake`）と組み合わせて使う。 本物の claude を起こさずに画面全体を
// 出せるので、API を使わずに何度でも撮り直せる（`docs/architecture/testing.md`「テスト」）。
//
// 使い方:
//   TSUKUMO_DRIVER=fake TSUKUMO_VIEW_PORT=7398 pnpm run start &
//   node scripts/capture/capture-view.ts 'http://127.0.0.1:7398/?t=<起動時に出るトークン>'
//   node scripts/capture/capture-view.ts <URL> --out /tmp/view.png --size 1400x900 \
//     --measure '[data-region="character"]' --measure '[data-region="sidebar"]'
//   node scripts/capture/capture-view.ts <URL> --wait-for '[role="table"][aria-label="検証結果"]'
//   node scripts/capture/capture-view.ts --scene report-blocks --size 600x900 \
//     --wait-for '[class*="report-files"]' --scroll-to '[class*="report-files"]'
//   node scripts/capture/capture-view.ts --scene report-blocks --reveal-at 1500
//   node scripts/capture/capture-view.ts --scene <場面> --type textarea '/' --click '[role="option"]'
//   node scripts/capture/capture-view.ts --scene <場面> --cwd <dir> --hash '#achievement' --wait-after <selector>
//
// `--measure` / `--wait-for` に class セレクタを書くときは `[class*="…"]`。 CSS Modules が
// `名前_ハッシュ`（`report-note_nkMPPQ`）に焼くので、素の `.report-note` は必ず「無し」になる。
//
// `--wait-for <selector>` は、要素が現れるのを待ったあと、`useReportReveal` が書き上げている
// 最中の要素に付ける `data-revealing` がページから消えるのも待つ。 演出中の要素は `clip-path` で
// 隠すだけで DOM には残り、大きさも変わらないので、要素が現れたことだけでは筆の途中を撮って
// しまう。どちらも上限を超えたら screenshot を撮らずに終わる（黙って空の画面を撮らない）。
// 演出は打ち切らず、この道具が開いたページの時計を進めて終わらせる（長いレポートでも上限に
// 当たらない。生きたタブには触れず、操作もしない）。
//
// 撮った画像はリポジトリに置かない（既定の出力先は /tmp）。ビューには会話の内容が写るので、
// 画像もその扱いに従う（`docs/coding-standards.md`「会話内容の扱い」— 別の場所に複製しない。
// fake driver の疑似セッションは架空の会話なので、その画像は共有してよい）。

import { statSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"

import { chromium, type Page } from "playwright-core"

import { readClockInstant, TEMPORAL_FOLLOWS_DATE_SCRIPT } from "../shared/capture-clock.ts"
import { positiveIntegerArgument } from "../shared/positive-integer-argument.ts"
import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import {
  applyPreparations,
  MAIN_REGION_SELECTOR,
  openPage,
  revealPageAt,
  scrollMatchNotice,
  SKIP_REVEAL_KEY,
  settlePage,
} from "./lib/capture-page.ts"
import {
  describePreparation,
  PREPARATION_OPTIONS,
  type Preparation,
  readPreparations,
} from "./lib/capture-preparation.ts"
import { type Source, sourceOf } from "./lib/capture-source.ts"
import { isStubbedCall, readRpcStub, type RpcStub, rpcPathOf } from "./lib/capture-stub.ts"
import { CATALOG } from "./lib/catalog-entry.ts"
import { imageSceneEntry, launchPlaceOf, workspaceOf } from "./lib/catalog-setup.ts"
import { describeElement } from "./lib/element-description.ts"
import { launchFakeScene } from "./lib/fake-scene-launch.ts"
import { formatPaperMetric, measurePaperMetric } from "./lib/paper-metric.ts"
import {
  formatRevealSnapshot,
  readRevealSnapshot,
  REVEAL_SEEN_SCRIPT,
} from "./lib/reveal-snapshot.ts"
import { revealForecast, sceneBlockKinds } from "./lib/scene-catalog.ts"
import {
  type SceneEventWatch,
  sceneEndTarget,
  sceneEventTimeoutMs,
  watchSceneEvents,
} from "./lib/scene-end.ts"
import { readSceneSession } from "./lib/scene-session.ts"

/** 既定の窓の大きさ。実機の目視で使ってきた値に揃えてある。 */
const DEFAULT_WIDTH = 1400
const DEFAULT_HEIGHT = 900

type WindowSize = { readonly width: number; readonly height: number }

/** `--paper-metric` が `--viewport` の指定なしで測る窓の並び。 */
const DEFAULT_PAPER_METRIC_VIEWPORTS: readonly WindowSize[] = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]

/** 既定の出力先。リポジトリの外に置く（会話の内容が写るため）。 */
const DEFAULT_OUT = "/tmp/tsukumo-view.png"

/** `--wait-for` が要素の出現と、演出の終わりをそれぞれ待つ上限（ミリ秒）。 */
const WAIT_FOR_TIMEOUT_MS = 15_000

/** 演出の終わりを待つあいだ、ブラウザの時計を1回に進める量（ミリ秒）。 */
const REVEAL_ADVANCE_MS = 1_000

/** 時計を進めるたびに実時間で空ける間隔（ミリ秒）。待った実時間の数え上げにも使う。 */
const REVEAL_POLL_MS = 50

/** `--scroll-to` で転がしたあと、偽の時計を進める量（ミリ秒）。転がしを受けた再描画を反映させる。 */
const SCROLL_ADVANCE_MS = 500

/** 書き上げていくように見せる演出が進行中の印（`useReportReveal` の `data-revealing`）。 */
const REVEALING_SELECTOR = "[data-revealing]"

const USAGE = `使い方:
  node scripts/capture/capture-view.ts <URL> [オプション]
  node scripts/capture/capture-view.ts --scene <場面> [オプション]
  node scripts/capture/capture-view.ts --list-scenes [--session <ファイル>]

  --scene <場面>        fake driver の tsukumo を自分で起こして撮り、終わったら自分で止める
                        （場面は test/fixture/fake-session.json〔--session があればそのファイル〕の turns[].name。URL とは併用しない）
  --cwd <dir>           --scene の tsukumo を起こす作業ディレクトリ（.beads や課題ファイルを探す先。既定はこの作業ツリー。手元の画像を置く場面は --out の隣に架空の画像入りの作業場所を立てる。件が演出を打ち切る場面は、--cwd の有無に関わらず打ち切ってから撮る。--scene と一緒にだけ使う）
  --session <ファイル>  --scene・--list-scenes が読む疑似セッションを同梱のファイルから差し替える（ファイルでなければ使い方を出して終わる）。読ませるのは架空の会話だけで、実物の会話（transcript・SDK のイベント）は渡さない
  --until-step <n>      --scene の場面を先頭から n 手目で止めた画を撮る（正の整数。--scene と一緒にだけ使う）
  --list-scenes         場面ごとに report に出る塊の kind と、書き上げる演出が掛かる見込みを一覧して終わる（撮らない。見込みは節の文字数からの見積もりで、描いて確かめてはいない）
  --out <path>          画像の出力先（既定 ${DEFAULT_OUT}）
  --size <幅>x<高さ>    窓の大きさ（既定 ${String(DEFAULT_WIDTH)}x${String(DEFAULT_HEIGHT)}）
  --measure <selector>  位置と大きさ（と scrollHeight・clientHeight）を数値で出す要素（何度でも指定できる）
  --wait-for <selector> 要素が出て、演出が終わるまで待ってから撮る（出なければ失敗して終わる）
  --scroll-to <selector> 要素をメインビューの上端へ送ってから撮る（無ければ失敗して終わる。2つ以上に当たるとコンマ区切りでも先頭へ転がし、「一致 n 個、先頭へ転がした」の行を出す。準備の手のあとに当たり〔書く位置は問わない〕、転がしたあと偽の時計があれば進めて落ち着くまで待つので、--advance を後ろに足さなくてよい。--reveal-at のときは時計を止めているので待たない）
  --type <selector> <文字>  入力欄に打ってから撮る
  --click <selector>    押してから撮る
  --hover <selector>    触れてから撮る
  --hash <hash>         location.hash を書いてから撮る
  --press <キー名>      キーを押してから撮る（Escape など。狭い窓の引き出しを閉じる。キーはフォーカスの置き場所へ届く。メインビューの中でもモーダルの中でもないと、置き場所を知らせる行を出す。PageDown などは先に --click で中を押す）
  --advance <ms>        偽の時計をミリ秒だけ進めてから撮る（待ち時間で出る画。Temporal.Now も従う）
  --clock <ISO 時刻>    ブラウザの時計をその時刻に決めて撮る（日付で表示が変わる画。オフセット付き、例 2026-01-15T12:00:00+09:00。Temporal.Now も従う）
  --reveal-at <ms>      書き上げる演出が始まった時点から偽の時計をミリ秒だけ進めたところで止め、途中の画を撮る（正の整数。--scene と一緒にだけ使う。演出は打ち切らず、--wait-for・--advance などの操作とは併用できない。演出が始まらない場面は 15 秒待って失敗するので、先に --list-scenes の見込みを見る）
  --wait-after <selector> その位置で要素が出るのを待つ（--hash で開いた画面の読み込みなど。出なければ失敗して終わる）
                        （7つは書いた順に、--wait-for のあと・--scroll-to の前に当てる。当たらなければ失敗して終わる）
  --stub-rpc '<手続き>[@<範囲>]=<JSON>'  手続きの応答を差し替えて撮る（何度でも指定できる。例 'planUsage.report={"kind":"not-applicable"}'。範囲は呼び出しの何回目かを1から数えて 3 か 1-2、省くと全部。範囲の外はサーバへ通す）
  --paper-metric        レポートの紙面の物差し（テンプレの手がかり・色相の族・判決の頭の高さ・読む面を超える図・横並びの縦落ち）を窓ごとに表で出す（既定は 1440x900 と 1920x1080。--reveal-at とは併用できない）
  --viewport <幅>x<高さ> --paper-metric で測る窓（何度でも指定できる。--paper-metric と一緒にだけ使う）
  --full                ページ全体を撮る（既定は窓に収まる範囲だけ）
`

type Options =
  | { readonly kind: "list-scenes"; readonly session: string | undefined }
  | {
      readonly kind: "capture"
      readonly source: Source
      readonly out: string
      readonly width: number
      readonly height: number
      readonly measures: readonly string[]
      readonly waitFor: string | undefined
      readonly scrollTo: string | undefined
      readonly preparations: readonly Preparation[]
      readonly clock: number | undefined
      readonly revealAt: number | undefined
      readonly stubs: readonly RpcStub[]
      readonly paperMetric: boolean
      readonly viewports: readonly WindowSize[]
      readonly fullPage: boolean
    }

async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv)
  if (options === undefined) {
    process.stderr.write(USAGE)
    return 2
  }

  if (options.kind === "list-scenes") {
    return printSceneCatalog(options.session)
  }

  const opened = await openSource(options.source, path.dirname(path.resolve(options.out)))
  if (opened === undefined) {
    return 1
  }

  try {
    return await capture(opened.url, opened.skipReveal, options)
  } finally {
    opened.close()
  }
}

/** 場面ごとの塊の一覧を出す。何も起こさない。戻り値は終了コード。 */
function printSceneCatalog(sessionPath: string | undefined): number {
  const reading = readSceneSession(sessionPath)
  if (reading.kind === "unreadable") {
    process.stderr.write(`${reading.message}\n`)
    return 1
  }
  const forecasts = revealForecast(reading.session)
  for (const [scene, kinds] of sceneBlockKinds(reading.session)) {
    const forecast = forecasts.get(scene) === "likely" ? "掛かる見込み" : "掛からない見込み"
    process.stdout.write(`${scene}: ${kinds.join(", ")}（演出: ${forecast}）\n`)
  }
  return 0
}

/** 開いた URL と、閉じる手段。`--scene` のときだけ閉じる手段が中身を持つ。 */
type OpenedSource = {
  readonly url: string
  readonly close: () => void
  /** 場面の件が `skipReveal` のとき true（撮る前に書き上げの演出を打ち切る）。 */
  readonly skipReveal: boolean
}

/**
 * `source` を開いて URL を得る。`--scene` は知らない場面名なら起こさずに理由を出す。
 * 起こすのに失敗したときも理由を出す。どちらも undefined（呼び出し側は撮らずに終わる）。
 */
async function openSource(source: Source, outDir: string): Promise<OpenedSource | undefined> {
  if (source.kind === "url") {
    return { url: source.url, close: () => undefined, skipReveal: false }
  }

  const reading = readSceneSession(source.session)
  if (reading.kind === "unreadable") {
    process.stderr.write(`${reading.message}\n`)
    return undefined
  }
  if (!reading.session.turns.some((scene) => scene.name === source.scene)) {
    process.stderr.write(`知らない場面: ${source.scene}\n`)
    return undefined
  }

  const imageEntry = imageSceneEntry(source.scene, CATALOG)
  const place = launchPlaceOf(source.cwd, source.scene, CATALOG)
  const cwd =
    place.kind === "given"
      ? place.cwd
      : place.kind === "image-workspace"
        ? workspaceOf(place.entry, outDir)
        : REPOSITORY_ROOT
  if (!isDirectory(cwd)) {
    process.stderr.write(`--cwd がディレクトリではない: ${cwd}\n`)
    return undefined
  }

  try {
    const launched = await launchFakeScene({
      cwd,
      scene: source.scene,
      home: undefined,
      session: source.session,
      extraEnv:
        source.until === undefined ? {} : { TSUKUMO_FAKE_SCENE_UNTIL: String(source.until) },
    })
    return { url: launched.url, close: launched.close, skipReveal: imageEntry?.skipReveal === true }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return undefined
  }
}

async function capture(
  url: string,
  skipReveal: boolean,
  options: Extract<Options, { readonly kind: "capture" }>,
): Promise<number> {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
    })
    const clockInstalled =
      options.waitFor !== undefined ||
      options.clock !== undefined ||
      options.revealAt !== undefined ||
      options.preparations.some((step) => step.kind === "advance")
    if (clockInstalled) {
      await (options.clock === undefined
        ? page.clock.install()
        : page.clock.install({ time: options.clock }))
      await page.addInitScript(TEMPORAL_FOLLOWS_DATE_SCRIPT)
    }
    if (options.revealAt !== undefined) {
      await page.addInitScript(REVEAL_SEEN_SCRIPT)
    }
    for (const stub of options.stubs) {
      await stubRpc(page, stub)
    }
    // 接続は遷移の途中で開くので、フレームを数え始めるのは遷移より前。
    const watch = watchSceneEvents(page)
    await openPage(page, url)

    const sceneFailure = await waitForSceneEnd(watch, options.source)
    if (sceneFailure !== undefined) {
      process.stderr.write(`${sceneFailure}\n`)
      return 1
    }
    if (skipReveal && options.revealAt === undefined) {
      await page.keyboard.press(SKIP_REVEAL_KEY)
    }
    const settleFailure = await (
      options.revealAt === undefined ? settlePage(page) : revealPageAt(page, options.revealAt)
    ).then(
      () => undefined,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )
    if (settleFailure !== undefined) {
      process.stderr.write(`${settleFailure}\n`)
      return 1
    }

    if (options.waitFor !== undefined && !(await waitForRevealSettled(page, options.waitFor))) {
      process.stderr.write(`現れなかった: ${options.waitFor}（${String(WAIT_FOR_TIMEOUT_MS)}ms）\n`)
      return 1
    }

    const [missed] = await applyPreparations(page, options.preparations, "stop", (line) => {
      process.stdout.write(`${line}\n`)
    })
    if (missed !== undefined) {
      process.stderr.write(`当てられなかった: ${describePreparation(missed)}\n`)
      return 1
    }

    if (options.scrollTo !== undefined) {
      const matched = await scrollIntoView(page, options.scrollTo)
      if (matched === 0) {
        process.stderr.write(`現れなかった: ${options.scrollTo}\n`)
        return 1
      }
      const notice = scrollMatchNotice(options.scrollTo, matched)
      if (notice !== "") {
        process.stdout.write(`${notice}\n`)
      }
      if (clockInstalled && options.revealAt === undefined) {
        await page.clock.runFor(SCROLL_ADVANCE_MS)
      }
      if (options.revealAt === undefined) {
        const scrollSettleFailure = await settlePage(page).then(
          () => undefined,
          (error: unknown) => (error instanceof Error ? error.message : String(error)),
        )
        if (scrollSettleFailure !== undefined) {
          process.stderr.write(`${scrollSettleFailure}\n`)
          return 1
        }
      }
    }

    await page.screenshot({ path: options.out, fullPage: options.fullPage })
    process.stdout.write(
      `撮った: ${options.out}（${String(options.width)}x${String(options.height)}）\n`,
    )

    if (options.revealAt !== undefined) {
      const snapshot = await readRevealSnapshot(page)
      for (const line of formatRevealSnapshot(options.revealAt, snapshot)) {
        process.stdout.write(`${line}\n`)
      }
    }

    for (const selector of options.measures) {
      process.stdout.write(`${selector}: ${await describeElement(page, selector)}\n`)
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    process.stdout.write(`横のはみ出し: ${String(overflow)}px\n`)

    if (options.paperMetric) {
      return await printPaperMetrics(page, options.viewports)
    }
    return 0
  } finally {
    await browser.close()
  }
}

/** 窓ごとに演出を打ち切って落ち着かせ、紙面の物差しを表で出す。測れなければ理由を出して 1。 */
async function printPaperMetrics(page: Page, viewports: readonly WindowSize[]): Promise<number> {
  for (const viewport of viewports) {
    try {
      await page.setViewportSize(viewport)
      await page.keyboard.press(SKIP_REVEAL_KEY)
      await settlePage(page)
      await page
        .locator(MAIN_REGION_SELECTOR)
        .first()
        .evaluate((element) => {
          element.scrollTop = 0
        })
      const rows = formatPaperMetric(await measurePaperMetric(page))
      process.stdout.write(
        `紙面の物差し ${String(viewport.width)}x${String(viewport.height)}\n${rows.join("\n")}\n`,
      )
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }
  return 0
}

/** 数え上げをブラウザ側に置くと再マウントで数えが狂うので、Node 側の `calls` で持つ。 */
async function stubRpc(page: Page, stub: RpcStub): Promise<void> {
  let calls = 0
  await page.route(`**/rpc/${rpcPathOf(stub.procedure)}**`, async (route) => {
    calls += 1
    if (!isStubbedCall(stub.range, calls)) {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ json: stub.body }),
    })
  })
}

/**
 * `--scene` で起こした場面の最後の手（`--until-step` があればその手）が画面へ届くまで待つ。
 * URL を渡された撮影は疑似セッションではないので待たない。待てなければ理由を返す。
 */
async function waitForSceneEnd(
  watch: SceneEventWatch,
  source: Source,
): Promise<string | undefined> {
  if (source.kind !== "scene") {
    return undefined
  }
  const reading = readSceneSession(source.session)
  if (reading.kind === "unreadable") {
    return reading.message
  }
  const target = sceneEndTarget(reading.session, source.scene, source.until)
  const timeoutMs =
    target === undefined
      ? undefined
      : sceneEventTimeoutMs(reading.session, source.scene, source.until, target)
  if (target === undefined || timeoutMs === undefined) {
    return `場面に待てる手が無い: ${source.scene}`
  }
  try {
    await watch.waitFor(target, { scene: source.scene, timeoutMs })
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

async function waitForRevealSettled(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: WAIT_FOR_TIMEOUT_MS })
    for (let waited = 0; waited < WAIT_FOR_TIMEOUT_MS; waited += REVEAL_POLL_MS) {
      if ((await page.$(REVEALING_SELECTOR)) === null) {
        return true
      }
      await page.clock.runFor(REVEAL_ADVANCE_MS)
      await page.waitForTimeout(REVEAL_POLL_MS)
    }
    return false
  } catch {
    return false
  }
}

/** 先頭の要素をメインビューのスクロールの容れ物の上端へ送り、当たった個数を返す（無ければ 0）。 */
async function scrollIntoView(page: Page, selector: string): Promise<number> {
  const locator = page.locator(selector)
  const count = await locator.count()
  if (count === 0) {
    return 0
  }
  await locator.first().evaluate((element) => {
    element.scrollIntoView({ block: "start" })
  })
  return count
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory()
  } catch {
    return false
  }
}

function isFile(target: string): boolean {
  try {
    return statSync(target).isFile()
  } catch {
    return false
  }
}

/**
 * 引数を読む。URL と `--scene` のどちらも無い・両方ある・`--size` が読めないときは undefined
 * （呼び出し側が使い方を出す）。`--type` の2つ目の値でない位置引数は1つだけ URL として読む。
 */
function parseOptions(argv: readonly string[]): Options | undefined {
  try {
    return readOptions(argv)
  } catch {
    return undefined
  }
}

function readOptions(argv: readonly string[]): Options | undefined {
  const { values, tokens } = parseArgs({
    args: [...argv],
    strict: true,
    allowPositionals: true,
    tokens: true,
    options: {
      ...PREPARATION_OPTIONS,
      out: { type: "string" },
      measure: { type: "string", multiple: true },
      "wait-for": { type: "string" },
      "scroll-to": { type: "string" },
      scene: { type: "string" },
      cwd: { type: "string" },
      "until-step": { type: "string" },
      "reveal-at": { type: "string" },
      clock: { type: "string" },
      size: { type: "string" },
      "stub-rpc": { type: "string", multiple: true },
      "paper-metric": { type: "boolean" },
      viewport: { type: "string", multiple: true },
      full: { type: "boolean" },
      "list-scenes": { type: "boolean" },
      session: { type: "string" },
    },
  })
  const session = values.session === undefined ? undefined : path.resolve(values.session)
  if (session !== undefined && !isFile(session)) {
    return undefined
  }
  if (values["list-scenes"] === true) {
    return { kind: "list-scenes", session }
  }

  const prepared = readPreparations(tokens)
  const untilStep =
    values["until-step"] === undefined
      ? undefined
      : positiveIntegerArgument.safeParse(values["until-step"])
  const revealAt =
    values["reveal-at"] === undefined
      ? undefined
      : positiveIntegerArgument.safeParse(values["reveal-at"])
  const clock = values.clock === undefined ? undefined : readClockInstant(values.clock)
  const size = values.size === undefined ? undefined : parseSize(values.size)
  const stubs = (values["stub-rpc"] ?? []).map(readRpcStub)
  const paperMetric = values["paper-metric"] === true
  const viewports = (values.viewport ?? []).map(parseSize)
  const urls = tokens.flatMap((token, index) =>
    token.kind === "positional" && !prepared?.textTokenIndexes.has(index) ? [token.value] : [],
  )
  if (
    prepared === undefined ||
    urls.length > 1 ||
    (untilStep !== undefined && !untilStep.success) ||
    (revealAt !== undefined &&
      (!revealAt.success ||
        values.scene === undefined ||
        values["wait-for"] !== undefined ||
        prepared.preparations.length > 0)) ||
    (values.clock !== undefined && clock === undefined) ||
    stubs.some((stub) => stub === undefined) ||
    viewports.some((viewport) => viewport === undefined) ||
    (viewports.length > 0 && !paperMetric) ||
    (paperMetric && revealAt !== undefined) ||
    (values.size !== undefined && size === undefined)
  ) {
    return undefined
  }

  const source = sourceOf(
    urls[0],
    values.scene,
    untilStep?.data,
    values.cwd === undefined ? undefined : path.resolve(values.cwd),
    session,
  )
  return source === undefined
    ? undefined
    : {
        kind: "capture",
        source,
        out: values.out ?? DEFAULT_OUT,
        width: size?.width ?? DEFAULT_WIDTH,
        height: size?.height ?? DEFAULT_HEIGHT,
        measures: values.measure ?? [],
        waitFor: values["wait-for"],
        scrollTo: values["scroll-to"],
        preparations: prepared.preparations,
        clock,
        revealAt: revealAt?.data,
        stubs: stubs.filter((stub) => stub !== undefined),
        paperMetric,
        viewports:
          viewports.length === 0
            ? DEFAULT_PAPER_METRIC_VIEWPORTS
            : viewports.filter((viewport) => viewport !== undefined),
        fullPage: values.full === true,
      }
}

function parseSize(value: string): { readonly width: number; readonly height: number } | undefined {
  const parts = value.split("x")
  const width = Number(parts[0])
  const height = Number(parts[1])
  if (parts.length !== 2 || !Number.isInteger(width) || !Number.isInteger(height)) {
    return undefined
  }
  return width > 0 && height > 0 ? { width, height } : undefined
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
