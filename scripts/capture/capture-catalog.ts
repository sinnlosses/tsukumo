// 画面の状態のカタログを一括で撮る道具。fake driver（`TSUKUMO_DRIVER=fake`）の場面を
// 名前で名指しして tsukumo を1件ずつ起こし、広い窓と狭い窓の2枚を撮って、並べて見るための
// 索引 HTML を書き出す。描画に関わる変更の `evidence`（`docs/architecture/testing.md`
// 「手で確かめること」）を作るための道具で、tsukumo 本体からは呼ばれないので scripts/ に置く。
//
// 依頼を手で送らずに、狙った状態が出る。 場面の名前は疑似セッション（test/fixture/fake-session.json）の
// `turns[].name` で、`TSUKUMO_FAKE_SCENE` で名指しすると起こした直後に流れる。
//
// 手を動かさないと出ない状態は、撮る前に操作を当てて出す（`Preparation`）。
// 領域の内側は転がってもページ自体は転がらないので、`fullPage` では下の方が1枚も撮れない
// （図とグラフがそれ）。疑似セッションにもサーバにも手を入れず、開いたページを操作して撮る。
//
// 1枚だけ撮る・要素の位置と大きさを数値で読むのは別の道具の仕事。こちらは
// 「起こす → 撮る → 落とす」を繰り返す側で、測りはしない。
//
// 先に `pnpm run build` が要る。 起こす tsukumo は `dist/browser/` に置いた成果物を読むだけで、
// 自分では組み立てない（起動は `readUiBundle` が成果物を読むだけ）。無いと1件ずつ
// 起動に失敗する。
//
// 使い方:
//   node scripts/capture/capture-catalog.ts --help                # --only に使える名前の一覧（撮らない）
//   node scripts/capture/capture-catalog.ts --only question-multi  # 1つだけ
//   node scripts/capture/capture-catalog.ts --out /tmp/別の置き場
//
// オプション無しで実行するとカタログ全部（広い窓・狭い窓の2枚ずつ）を撮る。 60秒では
// 終わらないので、一覧が欲しいだけなら `--help` を使う。
//
// `--help` は専用のフラグとして実装していない。`parseOptions` が「値を取らない・値を持たない
// フラグ」を一律で使い方の表示に落とすので、他のどの未知の引数を渡しても同じ表示になる
// （`--only` の名前一覧はそこに含めている）。
//
// 撮った画像はリポジトリに置かない（既定の出力先は /tmp。他の撮る道具と同じ決定を
// 引き継ぐ）。疑似セッションは架空の会話なので画像そのものは共有してよい。
//
// キャラクターは指定しない。 起こす側が覚えている立ち絵（`~/.tsukumo/state.json`）を
// そのまま使う — ここで `TSUKUMO_CHARACTER` を渡すと、利用者が最後に選んだ立ち絵を
// 上書きしてしまうため。

import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

import { type Browser, chromium, type Page } from "playwright-core"

import { applyPreparations, openPage } from "./lib/capture-page.ts"
import { describePreparation } from "./lib/capture-preparation.ts"
import {
  type CatalogEntry,
  type CatalogSize,
  CATALOG,
  type Settle,
  SIZES,
} from "./lib/catalog-entry.ts"
import { indexHtml, type Shot } from "./lib/catalog-index.ts"
import { applyHomeSetup, workspaceOf } from "./lib/catalog-setup.ts"
import { launchFakeScene } from "./lib/fake-scene-launch.ts"

/** 既定の出力先。リポジトリの外に置く（画面には会話が写るため）。 */
const DEFAULT_OUT_DIR = "/tmp/tsukumo-catalog"

/**
 * 最後の手が流れ終わるまでの余裕（ミリ秒）。場面はページが繋がってから流れ始める
 * （fake driver は最初のタブを待つ）ので、`opening`（0.2秒）とカタログの一番長い場面
 * （`turn-history` の約1.4秒）を足したものより後に撮る。
 */
const SCENE_TAIL_MS = 2000

/**
 * `settle.kind === "selector"` の件が、その要素が現れるまで待つ上限（ミリ秒）。
 * `report-checks` の2件目の `report` が届く約7秒、`work-plan-main-view` の最終 `report` が届く約10秒より余裕を持たせる。
 */
const SETTLE_SELECTOR_TIMEOUT_MS = 20_000

/**
 * 演出を打ち切るキー（`entry.skipReveal`。`SKIP_EVENT_NAMES` は
 * `keydown` ならどのキーでも拾うので、押すキーの意味は問わない）。フォーカスがどこにあっても
 * `window` の listener が capture 段階で拾うので、打つ前にどこかへフォーカスを当てる必要も無い。
 */
const SKIP_REVEAL_KEY = "Escape"

const USAGE = `使い方: node scripts/capture/capture-catalog.ts [オプション]

  --out <dir>     画像と索引の出力先（既定 ${DEFAULT_OUT_DIR}）
  --only <name>   カタログのうち1件だけ撮る（${CATALOG.map((entry) => entry.name).join(" / ")}）
`

type Options = {
  readonly outDir: string
  readonly only: string | undefined
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
  } catch (error) {
    process.stderr.write(
      `撮れなかった: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    return 1
  } finally {
    await browser.close()
  }

  const indexPath = path.join(options.outDir, "index.html")
  writeFileSync(indexPath, indexHtml(shots), "utf8")
  process.stdout.write(`${String(shots.length)}枚。索引: ${indexPath}\n`)
  return 0
}

/**
 * カタログ1件ぶん。tsukumo を起こし直して撮るので、前の場面の記録が画面に残らない
 * （同じセッションに依頼を重ねると、狙った状態だけを撮れない）。
 */
async function captureEntry(
  browser: Browser,
  entry: CatalogEntry,
  outDir: string,
): Promise<readonly Shot[]> {
  // `homeSetup.kind === "default"` の件は既定のホームのまま起こす（`home` は無い）。それ以外の
  // 件だけ、`--out` の下に立てた件専用のホームへ先に架空の中身を書いてから起こす。
  const home = entry.homeSetup.kind === "default" ? undefined : path.join(outDir, "home")
  if (home !== undefined) {
    await applyHomeSetup(entry.homeSetup, home)
  }
  const session = await launchFakeScene({
    cwd: workspaceOf(entry, outDir),
    scene: entry.scene,
    home,
    extraEnv: {},
  })
  try {
    const shots: Shot[] = []
    for (const size of SIZES) {
      const file = path.join(outDir, `${entry.name}-${size.name}.png`)
      await captureShot(browser, session.url, entry, size, file)
      process.stdout.write(`撮った: ${file}\n`)
      shots.push({ entry, size, file })
    }
    return shots
  } finally {
    session.close()
  }
}

async function captureShot(
  browser: Browser,
  url: string,
  entry: CatalogEntry,
  size: CatalogSize,
  file: string,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
  try {
    await openPage(page, url)
    // 疑似セッションが流れ終わってから操作を当てる。 流れている途中で押すと、狙った状態の手前で
    // 画面が組み直されて操作が空振りする。
    await settleScene(page, entry.settle, "before-prepare")
    if (entry.skipReveal) {
      // `prepare` の前に演出を終わらせる（理由は `CatalogEntry` の `skipReveal` のコメント）。
      await page.keyboard.press(SKIP_REVEAL_KEY)
    }
    // 当てられなくても撮る。窓の大きさによっては出ていない口がある（狭い窓でしか出ないタブ）ので、
    // 当たらなかったことだけを出す。撮れた画像を見れば何が出ていないか分かる。
    for (const missed of await applyPreparations(page, entry.prepare, "continue")) {
      process.stdout.write(`当てられなかった: ${describePreparation(missed)}\n`)
    }
    await settleScene(page, entry.settle, "after-prepare")
    await page.screenshot({ path: file, fullPage: size.fullPage })
  } finally {
    await page.close()
  }
}

/** `selector` の要素が上限まで現れなければ throw する（撮らずに落とす）。 */
async function settleScene(
  page: Page,
  settle: Settle,
  phase: "before-prepare" | "after-prepare",
): Promise<void> {
  if (settle.kind === "selector" && settle.phase === phase) {
    await page
      .waitForSelector(settle.selector, { timeout: SETTLE_SELECTOR_TIMEOUT_MS })
      .catch(() => {
        throw new Error(`現れなかった: ${settle.selector}`)
      })
    return
  }
  if (phase === "before-prepare") {
    await page.waitForTimeout(SCENE_TAIL_MS)
  }
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
