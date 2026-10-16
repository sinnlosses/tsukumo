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
// `--help` は専用のフラグとして実装していない。`parseOptions` が知らない引数・値の無い
// フラグを一律で使い方の表示に落とすので、他のどの未知の引数を渡しても同じ表示になる
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
import { parseArgs } from "node:util"

import { type Browser, chromium, type Page } from "playwright-core"

import {
  type FakeSession,
  readFakeSession,
} from "../../src/server/session-driver/adapter/fake-driver.ts"
import { applyPreparations, openPage, settlePage } from "./lib/capture-page.ts"
import { describeCatalogMiss } from "./lib/capture-preparation.ts"
import { type CatalogEntry, type CatalogSize, CATALOG, sizesOf } from "./lib/catalog-entry.ts"
import { indexHtml, type Shot } from "./lib/catalog-index.ts"
import { applyHomeSetup, workspaceOf } from "./lib/catalog-setup.ts"
import { launchFakeScene } from "./lib/fake-scene-launch.ts"
import {
  type SceneEventTarget,
  type SceneEventWatch,
  sceneEventTimeoutMs,
  sceneWindowPlan,
  settleSceneTarget,
  watchSceneEvents,
} from "./lib/scene-end.ts"

/** 既定の出力先。リポジトリの外に置く（画面には会話が写るため）。 */
const DEFAULT_OUT_DIR = "/tmp/tsukumo-catalog"

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

  const reading = readFakeSession()
  if (reading.kind === "unreadable") {
    process.stderr.write(`test/fixture/fake-session.json が読めない: ${reading.reason}\n`)
    return 1
  }

  mkdirSync(options.outDir, { recursive: true })
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  const shots: Shot[] = []
  try {
    for (const entry of entries) {
      shots.push(...(await captureEntry(browser, entry, options.outDir, reading.session)))
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
  fakeSession: FakeSession,
): Promise<readonly Shot[]> {
  // `homeSetup.kind === "default"` の件は既定のホームのまま起こす（`home` は無い）。それ以外の
  // 件だけ、`--out` の下に立てた件専用のホームへ先に架空の中身を書いてから起こす。
  const home = entry.homeSetup.kind === "default" ? undefined : path.join(outDir, "home")
  if (home !== undefined) {
    await applyHomeSetup(entry.homeSetup, home)
  }
  const launch = (): ReturnType<typeof launchFakeScene> =>
    launchFakeScene({
      cwd: workspaceOf(entry, outDir),
      scene: entry.scene,
      home,
      extraEnv: {},
    })
  let session = await launch()
  try {
    const shots: Shot[] = []
    for (const size of sizesOf(entry)) {
      const file = path.join(outDir, `${entry.name}-${size.name}.png`)
      const plan = sceneWindowPlan(entry.settle, shots.length)
      if (plan.relaunches) {
        session.close()
        session = await launch()
      }
      await captureShot(browser, session.url, entry, size, file, {
        fakeSession,
        waitsForScene: plan.waits,
      }).catch((error: unknown) => {
        throw new Error(
          `${entry.name}（${size.name}）: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
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
  scene: SceneWait,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
  try {
    // 接続は遷移の途中で開くので、フレームを数え始めるのは遷移より前。
    const watch = watchSceneEvents(page)
    await openPage(page, url)
    // 疑似セッションが流れ終わってから操作を当てる。 流れている途中で押すと、狙った状態の手前で
    // 画面が組み直されて操作が空振りする。
    await settleScene(page, entry, size, watch, scene, "before-prepare")
    if (entry.skipReveal) {
      // `prepare` の前に演出を終わらせる（理由は `CatalogEntry` の `skipReveal` のコメント）。
      await page.keyboard.press(SKIP_REVEAL_KEY)
    }
    // 描き直しの途中で押すと、あとから伸びる部品の分だけ狙った位置がずれる（scroll など）。
    await settlePage(page)
    // 当てられなくても撮る。窓の大きさによっては出ていない口がある（狭い窓でしか出ないタブ）ので、
    // 当たらなかったことだけを出す。撮れた画像を見れば何が出ていないか分かる。
    for (const missed of await applyPreparations(page, entry.prepare, "continue")) {
      process.stdout.write(`${describeCatalogMiss(entry.name, size.name, missed)}\n`)
    }
    await settleScene(page, entry, size, watch, scene, "after-prepare")
    await settlePage(page)
    await page.screenshot({ path: file, fullPage: size.fullPage })
  } finally {
    await page.close()
  }
}

type SceneWait = {
  readonly fakeSession: FakeSession
  /** この窓のページで場面が流れ終わるのを待つか（件の最初の窓だけ）。 */
  readonly waitsForScene: boolean
}

/**
 * `selector` の要素か、場面の終わりの手が上限まで現れなければ throw する（撮らずに落とす）。
 * 操作の前（`before-prepare`）は、`selector` の件でなければ場面の終わりを待つ。
 */
async function settleScene(
  page: Page,
  entry: CatalogEntry,
  size: CatalogSize,
  watch: SceneEventWatch,
  scene: SceneWait,
  phase: "before-prepare" | "after-prepare",
): Promise<void> {
  const { settle } = entry
  if (settle.kind === "selector" && settle.phase === phase) {
    await page
      .waitForSelector(settle.selector, { timeout: SETTLE_SELECTOR_TIMEOUT_MS })
      .catch(() => {
        throw new Error(`現れなかった: ${settle.selector}`)
      })
    return
  }
  if (phase === "before-prepare" && scene.waitsForScene) {
    const target = settleTarget(entry, scene.fakeSession)
    const timeoutMs = sceneEventTimeoutMs(scene.fakeSession, entry.scene, undefined, target)
    if (timeoutMs === undefined) {
      throw new Error(
        `場面に無い手を待つ指定: ${entry.name}（${target.kind} の ${String(target.occurrence)} 件目）`,
      )
    }
    await watch.waitFor(target, { scene: entry.scene, timeoutMs })
  }
}

/** 件が待つ場面の手。待てる手が場面に無ければ throw する。 */
function settleTarget(entry: CatalogEntry, fakeSession: FakeSession): SceneEventTarget {
  const target = settleSceneTarget(entry.settle, fakeSession, entry.scene)
  if (target === undefined) {
    throw new Error(`場面に待てる手が無い: ${entry.name}（場面 ${entry.scene}）`)
  }
  return target
}

/** 引数を読む。読めない指定は undefined（呼び出し側が使い方を出す）。 */
function parseOptions(argv: readonly string[]): Options | undefined {
  try {
    const { values } = parseArgs({
      args: [...argv],
      strict: true,
      options: { out: { type: "string" }, only: { type: "string" } },
    })
    return { outDir: values.out ?? DEFAULT_OUT_DIR, only: values.only }
  } catch {
    return undefined
  }
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
