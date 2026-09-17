// 画面の**状態のカタログ**を一括で撮る道具。偽の駆動（`TSUKUMO_DRIVER=fake`）の場面を
// 名前で名指しして tsukumo を1件ずつ起こし、広い窓と狭い窓の2枚を撮って、並べて見るための
// 索引 HTML を書き出す。描画に関わる変更の `evidence`（`docs/architecture.md`
// 「手で確かめること」）を作るための道具で、tsukumo 本体からは呼ばれないので scripts/ に置く。
//
// **依頼を手で送らずに、狙った状態が出る。** 場面の名前は台本（test/fixture/fake-session.json）の
// `turns[].name` で、`TSUKUMO_FAKE_SCENE` で名指しすると起こした直後に流れる。
//
// 1枚だけ撮る・要素の位置と大きさを数値で読むのは `capture-view.ts`（別の道具）。こちらは
// 「起こす → 撮る → 落とす」を繰り返す側で、測りはしない。
//
// 使い方:
//   bun run scripts/capture-catalog.ts                      # カタログ全部
//   bun run scripts/capture-catalog.ts --only question-multi # 1つだけ
//   bun run scripts/capture-catalog.ts --out /tmp/別の置き場
//
// **撮った画像はリポジトリに置かない**（既定の出力先は /tmp。`capture-view.ts` 冒頭の決定を
// 引き継ぐ）。台本は架空の会話なので画像そのものは共有してよい。
//
// **キャラクターは指定しない。** 起こす側が覚えている立ち絵（`~/.tsukumo/state.json`）を
// そのまま使う — ここで `TSUKUMO_CHARACTER` を渡すと、利用者が最後に選んだ立ち絵を
// 上書きしてしまうため。

import { type ChildProcess, spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { type Browser, chromium } from "playwright-core"

/** カタログの1件。`scene` は台本（test/fixture/fake-session.json）の場面の名前。 */
type CatalogEntry = {
  readonly scene: string
  readonly label: string
}

/**
 * 並べて見たい状態。**網羅はしない** — 直したときに崩れやすい場所（答え待ちの箱・ツールの進行・
 * レポートの記法）だけを選ぶ。足すときは台本に場面を足して、その名前をここに書く。
 */
const CATALOG: readonly CatalogEntry[] = [
  { scene: "question-multi", label: "質問（複数選択）" },
  { scene: "question-pair", label: "質問（2問・長い説明）" },
  { scene: "permission", label: "許可プロンプト" },
  { scene: "report", label: "レポートとツールの進行" },
  { scene: "notation", label: "レポートの記法（表・図・グラフ）" },
]

/**
 * 撮る窓の大きさ。**広いほうは `capture-view.ts` の既定と同じ**で、狭いほうは切り替えの規則
 * （`src/ui/styles/narrow-screen.css` の `max-width: 760px`）の内側に入る幅にしてある。
 *
 * 狭いほうだけページ全体を撮る。**縦に積み替わる**ので、窓に収まる範囲だけでは下の領域
 * （吹き出しと答え待ちの箱）が1枚に入らない。
 */
const SIZES = [
  { name: "wide", width: 1400, height: 900, fullPage: false },
  { name: "narrow", width: 720, height: 900, fullPage: true },
] as const

/** 既定の出力先。**リポジトリの外**に置く（画面には会話が写るため）。 */
const DEFAULT_OUT_DIR = "/tmp/tsukumo-catalog"

/** 起こした tsukumo が URL を出すまで待つ上限（ミリ秒）。ブラウザ側の組み立てを含む。 */
const LAUNCH_TIMEOUT_MS = 30_000

/** ページの中身が落ち着くまで待つ上限（ミリ秒）。SSE / WebSocket があるので networkidle は待たない。 */
const SETTLE_TIMEOUT_MS = 10_000

/** 最後の手が流れ終わるまでの余裕（ミリ秒）。台本の一番長い場面（約1.3秒）より後に撮る。 */
const SCENE_TAIL_MS = 1500

const USAGE = `使い方: bun run scripts/capture-catalog.ts [オプション]

  --out <dir>     画像と索引の出力先（既定 ${DEFAULT_OUT_DIR}）
  --only <scene>  カタログのうち1件だけ撮る（${CATALOG.map((entry) => entry.scene).join(" / ")}）
`

type Options = {
  readonly outDir: string
  readonly only: string | undefined
}

type Shot = {
  readonly entry: CatalogEntry
  readonly size: (typeof SIZES)[number]
  readonly file: string
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv)
  if (options === undefined) {
    process.stderr.write(USAGE)
    return 2
  }

  const entries =
    options.only === undefined ? CATALOG : CATALOG.filter((entry) => entry.scene === options.only)
  if (entries.length === 0) {
    process.stderr.write(`カタログに無い場面: ${String(options.only)}\n${USAGE}`)
    return 2
  }

  mkdirSync(options.outDir, { recursive: true })
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  const shots: Shot[] = []
  try {
    for (const entry of entries) {
      shots.push(...(await captureEntry(browser, entry, options.outDir)))
    }
  } finally {
    await browser.close()
  }

  const indexPath = path.join(options.outDir, "index.html")
  writeFileSync(indexPath, indexHtml(shots), "utf8")
  process.stdout.write(`${String(shots.length)}枚。索引: ${indexPath}\n`)
  return 0
}

/**
 * カタログ1件ぶん。**tsukumo を起こし直して撮る**ので、前の場面の記録が画面に残らない
 * （同じセッションに依頼を重ねると、狙った状態だけを撮れない）。
 */
async function captureEntry(
  browser: Browser,
  entry: CatalogEntry,
  outDir: string,
): Promise<readonly Shot[]> {
  const session = spawnTsukumo(entry.scene)
  try {
    const url = await waitForViewUrl(session)
    const shots: Shot[] = []
    for (const size of SIZES) {
      const file = path.join(outDir, `${entry.scene}-${size.name}.png`)
      await captureShot(browser, url, size, file)
      process.stdout.write(`撮った: ${file}\n`)
      shots.push({ entry, size, file })
    }
    return shots
  } finally {
    // 起こしたのはこの pid だけ。**広いパターンで落とさない**（開発中の tsukumo を巻き込むため）。
    session.kill("SIGTERM")
  }
}

async function captureShot(
  browser: Browser,
  url: string,
  size: (typeof SIZES)[number],
  file: string,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page
      .waitForSelector(".layout-main", { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => undefined)
    await page.waitForTimeout(SCENE_TAIL_MS)
    await page.screenshot({ path: file, fullPage: size.fullPage })
  } finally {
    await page.close()
  }
}

/**
 * tsukumo を1つ起こす。**空きポート（`TSUKUMO_VIEW_PORT=0`）**なので、常駐している tsukumo と
 * ぶつからない。タブは開かず（`TSUKUMO_OPEN_VIEW=0`）、駆動は台本だけ。
 */
function spawnTsukumo(scene: string): ChildProcess {
  const root = fileURLToPath(new URL("..", import.meta.url))
  return spawn("bun", ["run", path.join(root, "src", "cli.ts")], {
    cwd: root,
    env: {
      ...process.env,
      TSUKUMO_DRIVER: "fake",
      TSUKUMO_FAKE_SCENE: scene,
      TSUKUMO_VIEW_PORT: "0",
      TSUKUMO_OPEN_VIEW: "0",
      TSUKUMO_WATCH_UI: "0",
    },
    stdio: ["ignore", "pipe", "inherit"],
  })
}

/** 起こした tsukumo が出す配信 URL（`announce`）を待つ。出ないまま終わったら諦める。 */
function waitForViewUrl(session: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let seen = ""
    const timer = setTimeout(() => {
      reject(new Error(`tsukumo が URL を出さない（${String(LAUNCH_TIMEOUT_MS)}ms）`))
    }, LAUNCH_TIMEOUT_MS)
    const finish = (settle: () => void): void => {
      clearTimeout(timer)
      settle()
    }

    session.stdout?.on("data", (chunk: Buffer) => {
      seen += chunk.toString("utf8")
      const url = /https?:\/\/\S+/.exec(seen)?.[0]
      if (url !== undefined) {
        finish(() => resolve(url))
      }
    })
    session.on("exit", (code) => {
      finish(() => reject(new Error(`tsukumo が終了した（コード ${String(code)}）`)))
    })
  })
}

/**
 * 並べて見るための索引。**画像を1枚ずつ開かずに済ませる**のが目的なので、飾りは付けず
 * 見出しと画像だけを縦に並べる（外の CSS も JS も読まない）。
 */
function indexHtml(shots: readonly Shot[]): string {
  const sections = shots
    .map(
      (shot) =>
        `<section><h2>${escapeHtml(shot.entry.label)} — ${shot.size.width}x${shot.size.height}</h2>` +
        `<p><code>${escapeHtml(shot.entry.scene)}</code></p>` +
        `<img src="${escapeHtml(path.basename(shot.file))}" alt="${escapeHtml(shot.entry.label)}"></section>`,
    )
    .join("\n")

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>tsukumo 画面の状態のカタログ</title>
<style>body{font-family:sans-serif;margin:2rem;background:#111;color:#eee}img{max-width:100%;border:1px solid #444}section{margin-bottom:2rem}</style>
</head><body>
<h1>画面の状態のカタログ（台本の架空の会話）</h1>
${sections}
</body></html>
`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** 引数を読む。読めない指定は undefined（呼び出し側が使い方を出す）。 */
function parseOptions(argv: readonly string[]): Options | undefined {
  let outDir = DEFAULT_OUT_DIR
  let only: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (value === undefined) {
      return undefined
    }
    if (flag === "--out") {
      outDir = value
    } else if (flag === "--only") {
      only = value
    } else {
      return undefined
    }
    index += 1
  }

  return { outDir, only }
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
