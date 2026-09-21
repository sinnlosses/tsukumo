// 配信中のビューをヘッドレスの Chrome で開き、**画像に撮って、指定した要素の位置と大きさを
// 数値で出す**。描画に関わる変更の `evidence`（`docs/architecture.md`「手で確かめること」）を
// 作るための道具で、tsukumo 本体からは呼ばれないので scripts/ に置く。
//
// **手元の Google Chrome を使う**（`channel: "chrome"`）。Playwright のブラウザは落とさないので、
// 入っているのは `playwright-core`（driver だけ、13MB）。Chrome が無い環境では起動に失敗する。
//
// **fake driver（`TSUKUMO_DRIVER=fake`）と組み合わせて使う。** 本物の claude を起こさずに画面全体を
// 出せるので、API を使わずに何度でも撮り直せる（`docs/design.md` 10章）。
//
// 使い方:
//   TSUKUMO_DRIVER=fake TSUKUMO_VIEW_PORT=7398 bun run start &
//   bun run scripts/capture-view.ts 'http://127.0.0.1:7398/?t=<起動時に出るトークン>'
//   bun run scripts/capture-view.ts <URL> --out /tmp/view.png --size 1400x900 \
//     --measure '[data-region="character"]' --measure '[data-region="sidebar"]'
//
// **`--measure` に class セレクタを書くときは `[class*="…"]`。** CSS Modules が `名前_ハッシュ`
// （`report-note_nkMPPQ`）に焼くので、素の `.report-note` は必ず「無し」になる。
//
// **撮った画像はリポジトリに置かない**（既定の出力先は /tmp）。ビューには会話の内容が写るので、
// 画像もその扱いに従う（`docs/coding-standards.md`「会話内容の扱い」— 別の場所に複製しない。
// fake driver の疑似セッションは架空の会話なので、その画像は共有してよい）。

import process from "node:process"

import { chromium } from "playwright-core"

/** 既定の窓の大きさ。実機の目視（T-091 / T-092）で使ってきた値に揃えてある。 */
const DEFAULT_WIDTH = 1400
const DEFAULT_HEIGHT = 900

/** 既定の出力先。**リポジトリの外**に置く（会話の内容が写るため）。 */
const DEFAULT_OUT = "/tmp/tsukumo-view.png"

/** ページの中身が落ち着くまで待つ上限（ミリ秒）。SSE が繋ぎっぱなしなので networkidle は待たない。 */
const SETTLE_TIMEOUT_MS = 10_000

/**
 * 本文が入る領域（メインビュー）。**class 名は組み立てのたびにハッシュ化される**（CSS Modules）
 * ので、領域を指すときは `<Layout>` が付ける `data-region` を使う。
 */
const MAIN_REGION_SELECTOR = '[data-region="main"]'

const USAGE = `使い方: bun run scripts/capture-view.ts <URL> [オプション]

  --out <path>          画像の出力先（既定 ${DEFAULT_OUT}）
  --size <幅>x<高さ>    窓の大きさ（既定 ${String(DEFAULT_WIDTH)}x${String(DEFAULT_HEIGHT)}）
  --measure <selector>  位置と大きさを数値で出す要素（何度でも指定できる）
  --full                ページ全体を撮る（既定は窓に収まる範囲だけ）
`

type Options = {
  readonly url: string
  readonly out: string
  readonly width: number
  readonly height: number
  readonly measures: readonly string[]
  readonly fullPage: boolean
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv)
  if (options === undefined) {
    process.stderr.write(USAGE)
    return 2
  }

  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
    })
    await page.goto(options.url, { waitUntil: "domcontentloaded" })
    // SSE / WebSocket を繋ぎっぱなしにするページなので `networkidle` は永遠に来ない。
    // 最初の描画が落ち着くのを、本文が入る領域が現れるまでで待つ。
    await page
      .waitForSelector(MAIN_REGION_SELECTOR, { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => undefined)
    await page.waitForTimeout(500)

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

/**
 * 要素1つの位置と大きさを1行にする。**見つからないときは "無し"** を返して続ける
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

/** 引数を読む。URL が無い・`--size` が読めないときは undefined（呼び出し側が使い方を出す）。 */
function parseOptions(argv: readonly string[]): Options | undefined {
  const url = argv[0]
  if (url === undefined || url.startsWith("-")) {
    return undefined
  }

  const measures: string[] = []
  let out = DEFAULT_OUT
  let width = DEFAULT_WIDTH
  let height = DEFAULT_HEIGHT
  let fullPage = false

  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag === "--full") {
      fullPage = true
      continue
    }
    if (value === undefined) {
      return undefined
    }
    if (flag === "--out") {
      out = value
    } else if (flag === "--measure") {
      measures.push(value)
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

  return { url, out, width, height, measures, fullPage }
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
