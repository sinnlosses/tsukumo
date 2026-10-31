// 配信中のビューをヘッドレスの Chrome で開き、画像に撮って、指定した要素の位置と大きさを
// 数値で出す。描画に関わる変更の `evidence`（`docs/architecture/testing.md`「手で確かめること」）を
// 作るための道具で、tsukumo 本体からは呼ばれないので scripts/ に置く。
//
// Playwright の headless shell を使う。無い環境では起動に失敗するので
// `pnpm exec playwright-core install chromium-headless-shell` で入れる。製品版の Google Chrome
// （`channel: "chrome"`）は起こすたびにキーチェーンへ鍵を足すので使わない。
//
// fake driver（`TSUKUMO_DRIVER=fake`）と組み合わせて使う。 本物の claude を起こさずに画面全体を
// 出せるので、API を使わずに何度でも撮り直せる。
//
// 使い方（オプションの一覧は引数なしで打つと出る）:
//   TSUKUMO_DRIVER=fake TSUKUMO_VIEW_PORT=7398 pnpm run start &
//   node scripts/capture/capture-view.ts 'http://127.0.0.1:7398/?t=<起動時に出るトークン>'
//   node scripts/capture/capture-view.ts --scene report-blocks --reveal-at 1500
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

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { parseOptions, USAGE } from "./lib/capture-option.ts"
import { capture } from "./lib/capture-run.ts"
import type { Source } from "./lib/capture-source.ts"
import { CATALOG } from "./lib/catalog-entry.ts"
import { imageSceneEntry, launchPlaceOf, workspaceOf } from "./lib/catalog-setup.ts"
import { launchFakeScene } from "./lib/fake-scene-launch.ts"
import { revealForecast, sceneBlockKinds } from "./lib/scene-catalog.ts"
import { readSceneSession } from "./lib/scene-session.ts"

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
      builtDir: undefined,
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

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory()
  } catch {
    return false
  }
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
