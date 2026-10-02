// 配信中のビューをヘッドレスの Chrome で開き、画像に撮って、指定した要素の位置と大きさを
// 数値で出す。描画に関わる変更の `evidence`（`docs/architecture/testing.md`「手で確かめること」）を
// 作るための道具で、tsukumo 本体からは呼ばれないので scripts/ に置く。
//
// 手元の Google Chrome を使う（`channel: "chrome"`）。Playwright のブラウザは落とさないので、
// 入っているのは `playwright-core`（driver だけ、13MB）。Chrome が無い環境では起動に失敗する。
//
// fake driver（`TSUKUMO_DRIVER=fake`）と組み合わせて使う。 本物の claude を起こさずに画面全体を
// 出せるので、API を使わずに何度でも撮り直せる（`docs/architecture/testing.md`「テスト」）。
//
// 使い方:
//   TSUKUMO_DRIVER=fake TSUKUMO_VIEW_PORT=7398 pnpm run start &
//   node scripts/capture-view.ts 'http://127.0.0.1:7398/?t=<起動時に出るトークン>'
//   node scripts/capture-view.ts <URL> --out /tmp/view.png --size 1400x900 \
//     --measure '[data-region="character"]' --measure '[data-region="sidebar"]'
//   node scripts/capture-view.ts <URL> --wait-for '[role="table"][aria-label="検証結果"]'
//
// `--measure` / `--wait-for` に class セレクタを書くときは `[class*="…"]`。 CSS Modules が
// `名前_ハッシュ`（`report-note_nkMPPQ`）に焼くので、素の `.report-note` は必ず「無し」になる。
//
// `--wait-for <selector>` は、要素が現れるのを待ったあと、`useReportReveal` が書き上げている
// 最中の要素に付ける `data-revealing` がページから消えるのも待つ。 演出中の要素は `clip-path` で
// 隠すだけで DOM には残り、大きさも変わらないので、要素が現れたことだけでは筆の途中を撮って
// しまう。どちらも上限を超えたら screenshot を撮らずに終わる（黙って空の画面を撮らない）。
// 演出そのものは打ち切らない（生きたタブを操作で進めると、そのタブを見ている人の体験を変えてしまう）。
//
// 撮った画像はリポジトリに置かない（既定の出力先は /tmp）。ビューには会話の内容が写るので、
// 画像もその扱いに従う（`docs/coding-standards.md`「会話内容の扱い」— 別の場所に複製しない。
// fake driver の疑似セッションは架空の会話なので、その画像は共有してよい）。

import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { chromium, type Page } from "playwright-core"

import { readFakeSession } from "../src/server/session-driver/adapter/fake-driver.ts"
import { spawnFakeTsukumo, waitForViewUrl } from "./lib/fake-tsukumo-process.ts"
import { sceneBlockKinds } from "./lib/scene-catalog.ts"

/** 既定の窓の大きさ。実機の目視で使ってきた値に揃えてある。 */
const DEFAULT_WIDTH = 1400
const DEFAULT_HEIGHT = 900

/** 既定の出力先。リポジトリの外に置く（会話の内容が写るため）。 */
const DEFAULT_OUT = "/tmp/tsukumo-view.png"

/** ページの中身が落ち着くまで待つ上限（ミリ秒）。SSE が繋ぎっぱなしなので networkidle は待たない。 */
const SETTLE_TIMEOUT_MS = 10_000

/** `--wait-for` が要素の出現と、演出の終わりをそれぞれ待つ上限（ミリ秒）。 */
const WAIT_FOR_TIMEOUT_MS = 15_000

/** `--scene` で起こした tsukumo が配信 URL を出すまで待つ上限（ミリ秒）。 */
const LAUNCH_TIMEOUT_MS = 30_000

/**
 * 本文が入る領域（メインビュー）。class 名は組み立てのたびにハッシュ化される（CSS Modules）
 * ので、領域を指すときは `<Layout>` が付ける `data-region` を使う。
 */
const MAIN_REGION_SELECTOR = '[data-region="main"]'

/** 書き上げていくように見せる演出が進行中の印（`useReportReveal` の `data-revealing`）。 */
const REVEALING_SELECTOR = "[data-revealing]"

const USAGE = `使い方:
  node scripts/capture-view.ts <URL> [オプション]
  node scripts/capture-view.ts --scene <場面> [オプション]
  node scripts/capture-view.ts --list-scenes

  --scene <場面>        fake driver の tsukumo を自分で起こして撮り、終わったら自分で止める
                        （場面は test/fixture/fake-session.json の turns[].name。URL とは併用しない）
  --list-scenes         場面ごとに report に出る塊の kind を一覧して終わる（撮らない）
  --out <path>          画像の出力先（既定 ${DEFAULT_OUT}）
  --size <幅>x<高さ>    窓の大きさ（既定 ${String(DEFAULT_WIDTH)}x${String(DEFAULT_HEIGHT)}）
  --measure <selector>  位置と大きさを数値で出す要素（何度でも指定できる）
  --wait-for <selector> 要素が出て、演出が終わるまで待ってから撮る（出なければ失敗して終わる）
  --full                ページ全体を撮る（既定は窓に収まる範囲だけ）
`

/** 開く先。URL を直に渡すか、場面の名前で fake driver の tsukumo を自分で起こすか。 */
type Source =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "scene"; readonly scene: string }

type Options =
  | { readonly kind: "list-scenes" }
  | {
      readonly kind: "capture"
      readonly source: Source
      readonly out: string
      readonly width: number
      readonly height: number
      readonly measures: readonly string[]
      readonly waitFor: string | undefined
      readonly fullPage: boolean
    }

async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv)
  if (options === undefined) {
    process.stderr.write(USAGE)
    return 2
  }

  if (options.kind === "list-scenes") {
    return printSceneCatalog()
  }

  const opened = await openSource(options.source)
  if (opened === undefined) {
    return 1
  }

  try {
    return await capture(opened.url, options)
  } finally {
    opened.close()
  }
}

/** 場面ごとの塊の一覧を出す。何も起こさない。戻り値は終了コード。 */
function printSceneCatalog(): number {
  const session = readFakeSession()
  if (session === undefined) {
    process.stderr.write("test/fixture/fake-session.json が読めない\n")
    return 1
  }
  for (const [scene, kinds] of sceneBlockKinds(session)) {
    process.stdout.write(`${scene}: ${kinds.join(", ")}\n`)
  }
  return 0
}

/** 開いた URL と、閉じる手段。`--scene` のときだけ閉じる手段が中身を持つ。 */
type OpenedSource = { readonly url: string; readonly close: () => void }

/**
 * `source` を開いて URL を得る。`--scene` は知らない場面名なら起こさずに理由を出す。
 * 起こすのに失敗したときも理由を出す。どちらも undefined（呼び出し側は撮らずに終わる）。
 */
async function openSource(source: Source): Promise<OpenedSource | undefined> {
  if (source.kind === "url") {
    return { url: source.url, close: () => undefined }
  }

  const session = readFakeSession()
  if (session === undefined || !session.turns.some((scene) => scene.name === source.scene)) {
    process.stderr.write(`知らない場面: ${source.scene}\n`)
    return undefined
  }

  const child = spawnFakeTsukumo({
    entry: path.join(repositoryRoot(), "src", "cli.ts"),
    cwd: repositoryRoot(),
    scene: source.scene,
    port: 0,
    home: undefined,
    extraEnv: {},
    dropInheritedTsukumoEnv: false,
    stderr: "inherit",
  })
  try {
    const url = await waitForViewUrl(child, LAUNCH_TIMEOUT_MS)
    return { url, close: () => child.kill("SIGTERM") }
  } catch (error) {
    child.kill("SIGTERM")
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return undefined
  }
}

async function capture(
  url: string,
  options: Extract<Options, { readonly kind: "capture" }>,
): Promise<number> {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
    })
    await page.goto(url, { waitUntil: "domcontentloaded" })
    // SSE / WebSocket を繋ぎっぱなしにするページなので `networkidle` は永遠に来ない。
    // 最初の描画が落ち着くのを、本文が入る領域が現れるまでで待つ。
    await page
      .waitForSelector(MAIN_REGION_SELECTOR, { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => undefined)
    await page.waitForTimeout(500)

    if (options.waitFor !== undefined && !(await waitForRevealSettled(page, options.waitFor))) {
      process.stderr.write(`現れなかった: ${options.waitFor}（${String(WAIT_FOR_TIMEOUT_MS)}ms）\n`)
      return 1
    }

    await page.screenshot({ path: options.out, fullPage: options.fullPage })
    process.stdout.write(
      `撮った: ${options.out}（${String(options.width)}x${String(options.height)}）\n`,
    )

    for (const selector of options.measures) {
      process.stdout.write(`${selector}: ${await describeElement(page, selector)}\n`)
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    process.stdout.write(`横のはみ出し: ${String(overflow)}px\n`)
    return 0
  } finally {
    await browser.close()
  }
}

/** いま居る作業ツリーの直下（この道具が置いてある `scripts/` の親）。 */
function repositoryRoot(): string {
  return fileURLToPath(new URL("..", import.meta.url))
}

async function waitForRevealSettled(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: WAIT_FOR_TIMEOUT_MS })
    await page.waitForSelector(REVEALING_SELECTOR, {
      state: "detached",
      timeout: WAIT_FOR_TIMEOUT_MS,
    })
    return true
  } catch {
    return false
  }
}

/**
 * 要素1つの位置と大きさを1行にする。見つからないときは "無し" を返して続ける
 * （道具なので、1つ測れなくても残りを出す）。同じセレクタに複数当たったら件数も添える。
 */
async function describeElement(
  page: { readonly locator: (selector: string) => Locator },
  selector: string,
): Promise<string> {
  const locator = page.locator(selector)
  const count = await locator.count()
  if (count === 0) {
    return "無し"
  }

  const box = await locator.first().boundingBox()
  if (box === null) {
    return `${String(count)}件（描画されていない）`
  }

  const rect = `top ${round(box.y)} / bottom ${round(box.y + box.height)} / left ${round(box.x)} / 幅 ${round(box.width)} / 高さ ${round(box.height)}`
  return count === 1 ? rect : `${String(count)}件、先頭: ${rect}`
}

/** Playwright の `Locator` のうち、この道具が使う分だけ。 */
type Locator = {
  readonly count: () => Promise<number>
  readonly first: () => {
    readonly boundingBox: () => Promise<{
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
    } | null>
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 引数を読む。URL と `--scene` のどちらも無い・両方ある・`--size` が読めないときは undefined
 * （呼び出し側が使い方を出す）。先頭が `-` で始まらないトークンは1つだけ URL として読む。
 */
function parseOptions(argv: readonly string[]): Options | undefined {
  let url: string | undefined
  let scene: string | undefined
  let listScenes = false
  const measures: string[] = []
  let out = DEFAULT_OUT
  let width = DEFAULT_WIDTH
  let height = DEFAULT_HEIGHT
  let waitFor: string | undefined
  let fullPage = false

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === undefined) {
      return undefined
    }
    if (!flag.startsWith("-")) {
      if (url !== undefined) {
        return undefined
      }
      url = flag
      continue
    }
    if (flag === "--full") {
      fullPage = true
      continue
    }
    if (flag === "--list-scenes") {
      listScenes = true
      continue
    }
    const value = argv[index + 1]
    if (value === undefined) {
      return undefined
    }
    if (flag === "--out") {
      out = value
    } else if (flag === "--measure") {
      measures.push(value)
    } else if (flag === "--wait-for") {
      waitFor = value
    } else if (flag === "--scene") {
      scene = value
    } else if (flag === "--size") {
      const size = parseSize(value)
      if (size === undefined) {
        return undefined
      }
      width = size.width
      height = size.height
    } else {
      return undefined
    }
    index += 1
  }

  if (listScenes) {
    return { kind: "list-scenes" }
  }
  const source = sourceOf(url, scene)
  return source === undefined
    ? undefined
    : { kind: "capture", source, out, width, height, measures, waitFor, fullPage }
}

/** URL と場面名のどちらか片方だけが要る。両方・どちらも無いときは undefined。 */
function sourceOf(url: string | undefined, scene: string | undefined): Source | undefined {
  if (url !== undefined && scene === undefined) {
    return { kind: "url", url }
  }
  if (scene !== undefined && url === undefined) {
    return { kind: "scene", scene }
  }
  return undefined
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
