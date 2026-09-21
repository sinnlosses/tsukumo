// 画面の**状態のカタログ**を一括で撮る道具。fake driver（`TSUKUMO_DRIVER=fake`）の場面を
// 名前で名指しして tsukumo を1件ずつ起こし、広い窓と狭い窓の2枚を撮って、並べて見るための
// 索引 HTML を書き出す。描画に関わる変更の `evidence`（`docs/architecture.md`
// 「手で確かめること」）を作るための道具で、tsukumo 本体からは呼ばれないので scripts/ に置く。
//
// **依頼を手で送らずに、狙った状態が出る。** 場面の名前は疑似セッション（test/fixture/fake-session.json）の
// `turns[].name` で、`TSUKUMO_FAKE_SCENE` で名指しすると起こした直後に流れる。
//
// **手を動かさないと出ない状態は、撮る前に操作を当てて出す**（{@link Preparation} の4種）。
// 領域の内側は転がっても**ページ自体は転がらない**ので、`fullPage` では下の方が1枚も撮れない
// （図とグラフがそれ）。疑似セッションにもサーバにも手を入れず、開いたページを操作して撮る。
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
// 引き継ぐ）。疑似セッションは架空の会話なので画像そのものは共有してよい。
//
// **キャラクターは指定しない。** 起こす側が覚えている立ち絵（`~/.tsukumo/state.json`）を
// そのまま使う — ここで `TSUKUMO_CHARACTER` を渡すと、利用者が最後に選んだ立ち絵を
// 上書きしてしまうため。

import { type ChildProcess, spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { type Browser, chromium, type Page } from "playwright-core"

/**
 * 撮る前に当てる操作。**この4種だけ**にする（`docs/research/ui-catalog.md` 1.4 で、これだけで
 * 撮れていなかった状態が全部撮れることを確かめた）。当てない件は空の並びで表し、「操作が無い」を
 * `undefined` で書かない。
 *
 * - `scroll`: その要素が見えるところまで、**それを囲む領域の内側**を送る
 * - `click`: 押す（モーダルを開く口・狭い窓のタブ）
 * - `type`: 入力欄に打つ（`/` と `@` の補完）
 * - `hash`: `location.hash` を書いて画面を移す（キャラクター画面・作る画面）
 */
type Preparation =
  | { readonly kind: "scroll"; readonly selector: string }
  | { readonly kind: "click"; readonly selector: string }
  | { readonly kind: "type"; readonly selector: string; readonly text: string }
  | { readonly kind: "hash"; readonly hash: string }

/**
 * カタログの1件。`scene` は疑似セッション（test/fixture/fake-session.json）の場面の名前で、`name` は
 * **画像のファイル名と `--only` の名指しに使う一意の名前**（同じ場面を別の操作で何枚も撮るので、
 * 場面の名前では足りない）。
 */
type CatalogEntry = {
  readonly name: string
  readonly scene: string
  readonly label: string
  readonly prepare: readonly Preparation[]
}

/**
 * 本文が入る領域（メインビュー）。**class 名は組み立てのたびにハッシュ化される**（CSS Modules）
 * ので、領域を指すときは `<Layout>` が付ける `data-region` を使う。
 */
const MAIN_REGION_SELECTOR = '[data-region="main"]'

/** 本文が入る領域の中で、**領域の外まではみ出して1枚に入らない**もの（疑似セッションの `notation`）。 */
const MERMAID_SELECTOR = `${MAIN_REGION_SELECTOR} svg`
const CHART_SELECTOR = `${MAIN_REGION_SELECTOR} canvas`

/** 入力欄。ページに `<textarea>` は1つしか無い。 */
const COMPOSER_SELECTOR = "textarea"

/**
 * 狭い窓でだけ出る領域のタブと、タスク一覧を開く口。**広い窓ではタブが隠れている**ので、
 * タブを押す手は空振りする（空振りは飛ばして次の手へ進む。{@link applyPreparation}）。
 */
const SIDEBAR_TAB_SELECTOR = '[role="tab"]:has-text("サイドバー")'
const TASK_BOARD_SELECTOR = 'button:has-text("一覧を見る")'

/**
 * 並べて見たい状態。**網羅はしない** — 直したときに崩れやすい場所（答え待ちの箱・ツールの進行・
 * レポートの記法・補完の候補・キャラクター画面）だけを選ぶ。足すときは疑似セッションに場面を足して、
 * その名前と、撮る前に当てる操作をここに書く。
 */
const CATALOG: readonly CatalogEntry[] = [
  { name: "question-multi", scene: "question-multi", label: "質問（複数選択）", prepare: [] },
  { name: "question-pair", scene: "question-pair", label: "質問（2問・長い説明）", prepare: [] },
  {
    name: "question-long",
    scene: "question-long",
    label: "質問（長いラベルと長い説明・複数選択と単一選択）",
    prepare: [],
  },
  { name: "permission", scene: "permission", label: "許可プロンプト", prepare: [] },
  { name: "report", scene: "report", label: "レポートとツールの進行", prepare: [] },
  { name: "notation", scene: "notation", label: "レポートの記法（引用・表・注意）", prepare: [] },
  // **記法の見本は領域に1枚ぶんが入らない**（1400x900 で 1358px のうち 855px が領域の外）。
  // 領域を伸ばして1枚にすると他の領域が重なって本番と別の姿になるので、**送って複数枚に分ける**。
  {
    name: "notation-figure",
    scene: "notation",
    label: "レポートの記法（図。領域を送った先）",
    prepare: [{ kind: "scroll", selector: MERMAID_SELECTOR }],
  },
  {
    name: "notation-chart",
    scene: "notation",
    label: "レポートの記法（グラフ。領域を送った先）",
    prepare: [{ kind: "scroll", selector: CHART_SELECTOR }],
  },
  {
    name: "task-board",
    scene: "report",
    label: "タスク一覧のモーダル",
    prepare: [
      { kind: "click", selector: SIDEBAR_TAB_SELECTOR },
      { kind: "click", selector: TASK_BOARD_SELECTOR },
    ],
  },
  {
    name: "command-suggestions",
    scene: "report",
    label: "「/」のコマンド補完",
    prepare: [{ kind: "type", selector: COMPOSER_SELECTOR, text: "/c" }],
  },
  {
    name: "file-suggestions",
    scene: "report",
    label: "「@」のファイル補完",
    prepare: [{ kind: "type", selector: COMPOSER_SELECTOR, text: "@src/browser/" }],
  },
  {
    name: "character-screen",
    scene: "report",
    label: "キャラクター画面",
    prepare: [{ kind: "hash", hash: "#character" }],
  },
  {
    name: "character-create",
    scene: "report",
    label: "キャラクターを作る画面",
    prepare: [{ kind: "hash", hash: "#character/new" }],
  },
]

/**
 * 撮る窓の大きさ。**広いほうは `capture-view.ts` の既定と同じ**で、狭いほうは切り替えの規則
 * （各機能の `*.module.css` の `max-width: 760px`）の内側に入る幅にしてある。
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

/** 最後の手が流れ終わるまでの余裕（ミリ秒）。疑似セッションの一番長い場面（約1.3秒）より後に撮る。 */
const SCENE_TAIL_MS = 1500

/**
 * 操作を1つ当てるのに待つ上限（ミリ秒）と、当てたあとに描き直しを待つ余裕（ミリ秒）。
 * **窓の大きさによっては当たらない口がある**（狭い窓でしか出ないタブ）ので、短めに切る。
 */
const PREPARE_TIMEOUT_MS = 2000
const PREPARE_SETTLE_MS = 800

const USAGE = `使い方: bun run scripts/capture-catalog.ts [オプション]

  --out <dir>     画像と索引の出力先（既定 ${DEFAULT_OUT_DIR}）
  --only <name>   カタログのうち1件だけ撮る（${CATALOG.map((entry) => entry.name).join(" / ")}）
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
    options.only === undefined ? CATALOG : CATALOG.filter((entry) => entry.name === options.only)
  if (entries.length === 0) {
    process.stderr.write(`カタログに無い名前: ${String(options.only)}\n${USAGE}`)
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
      const file = path.join(outDir, `${entry.name}-${size.name}.png`)
      await captureShot(browser, url, entry, size, file)
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
  entry: CatalogEntry,
  size: (typeof SIZES)[number],
  file: string,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page
      .waitForSelector(MAIN_REGION_SELECTOR, { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => undefined)
    // **疑似セッションが流れ終わってから操作を当てる。** 流れている途中で押すと、狙った状態の手前で
    // 画面が組み直されて操作が空振りする。
    await page.waitForTimeout(SCENE_TAIL_MS)
    for (const step of entry.prepare) {
      await applyPreparation(page, step)
    }
    if (entry.prepare.length > 0) {
      await page.waitForTimeout(PREPARE_SETTLE_MS)
    }
    await page.screenshot({ path: file, fullPage: size.fullPage })
  } finally {
    await page.close()
  }
}

/**
 * 操作を1つ当てる。**当てられなくても撮る** — 窓の大きさによっては出ていない口がある
 * （狭い窓でしか出ない領域のタブ）ので、当たらなかったことだけを出して次の手へ進む。
 * 当たらなかった手のぶん画面は動いていないので、撮れた画像を見れば何が出ていないか分かる。
 */
async function applyPreparation(page: Page, step: Preparation): Promise<void> {
  try {
    switch (step.kind) {
      case "scroll":
        await page
          .locator(step.selector)
          .first()
          .scrollIntoViewIfNeeded({ timeout: PREPARE_TIMEOUT_MS })
        break
      case "click":
        await page.locator(step.selector).first().click({ timeout: PREPARE_TIMEOUT_MS })
        break
      case "type":
        await page
          .locator(step.selector)
          .first()
          .pressSequentially(step.text, { timeout: PREPARE_TIMEOUT_MS })
        break
      case "hash":
        await page.evaluate((hash: string) => {
          window.location.hash = hash
        }, step.hash)
        break
    }
  } catch {
    process.stdout.write(`当てられなかった: ${describePreparation(step)}\n`)
  }
}

/** 当てられなかった手を1行で言う（何が出ていない画像なのかを読み手が分かるように）。 */
function describePreparation(step: Preparation): string {
  switch (step.kind) {
    case "scroll":
      return `${step.selector} が見えるまで送る`
    case "click":
      return `${step.selector} を押す`
    case "type":
      return `${step.selector} に ${step.text} と打つ`
    case "hash":
      return `location.hash に ${step.hash} を書く`
  }
}

/**
 * tsukumo を1つ起こす。**空きポート（`TSUKUMO_VIEW_PORT=0`）**なので、常駐している tsukumo と
 * ぶつからない。タブは開かず（`TSUKUMO_OPEN_VIEW=0`）、駆動は fake driver だけ。
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
 *
 * **1件のぶんは1つの節にまとめ、頭に行き先の一覧を置く** — 件数が増えても、探している件まで
 * 転がし続けずに飛べるようにする。
 */
function indexHtml(shots: readonly Shot[]): string {
  const entries = catalogEntriesOf(shots)
  const links = entries
    .map((entry) => `<li><a href="#${escapeHtml(entry.name)}">${escapeHtml(entry.label)}</a></li>`)
    .join("\n")
  const sections = entries
    .map((entry) => {
      const images = shots
        .filter((shot) => shot.entry.name === entry.name)
        .map(
          (shot) =>
            `<figure><figcaption>${shot.size.width}x${shot.size.height}</figcaption>` +
            `<img src="${escapeHtml(path.basename(shot.file))}" alt="${escapeHtml(entry.label)}"></figure>`,
        )
        .join("\n")
      return (
        `<section id="${escapeHtml(entry.name)}"><h2>${escapeHtml(entry.label)}</h2>` +
        `<p><code>${escapeHtml(entry.name)}</code>（疑似セッションの場面 <code>${escapeHtml(entry.scene)}</code>）</p>` +
        `${images}</section>`
      )
    })
    .join("\n")

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>tsukumo 画面の状態のカタログ</title>
<style>body{font-family:sans-serif;margin:2rem;background:#111;color:#eee}img{max-width:100%;border:1px solid #444}section{margin-bottom:2rem}figure{margin:0 0 1rem}figcaption{color:#aaa;font-size:.85rem}a{color:#7fd}</style>
</head><body>
<h1>画面の状態のカタログ（疑似セッションの架空の会話）</h1>
<nav><ul>
${links}
</ul></nav>
${sections}
</body></html>
`
}

/** 撮れた順のまま、1件につき1つだけ取り出す（同じ件は広い窓と狭い窓で2枚ある）。 */
function catalogEntriesOf(shots: readonly Shot[]): readonly CatalogEntry[] {
  return shots
    .map((shot) => shot.entry)
    .filter((entry, index, all) => all.findIndex((other) => other.name === entry.name) === index)
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
