// tsukumo のエントリポイント。**引数の受け取り・環境変数の読み出し・終了コードの返し方**だけを
// 持ち、起動の段取りは `src/main.ts` が進める（docs/design.md 2章「ディレクトリ」）。

import process from "node:process"

import { run } from "./main.ts"
import { readConfig, readReportChannel } from "./server/core/config.ts"
import { DEFAULT_VIEW_PORT, VIEW_PORT_FALLBACK_ATTEMPTS } from "./server/core/port-resolution.ts"

const USAGE = `tsukumo — キャラクターと一緒に仕事をするためのターミナル環境

使い方:
  tsukumo   （プロジェクトのディレクトリで打つ。開発中はリポジトリ直下の bun run start でも同じ）

起動すると Claude Code のセッションが立ち上がり、ビューの配信とレイアウトページのタブを
開くところまで1コマンドで進む。**前に同じディレクトリで同じキャラクターと話していたセッションが
あれば、その続きから始まる**（docs/requirements.md 4.8。キャラクターごとに別のセッションを持つ。
新規に起こしたいときは TSUKUMO_NEW_SESSION=1）。
カレントディレクトリを作業対象にする（claude を打つのと同じ感覚）。

環境変数:
  TSUKUMO_VIEW_PORT   ビューを配るポート（既定 ${String(DEFAULT_VIEW_PORT)}。既定のまま塞がっていたら
                      ${String(VIEW_PORT_FALLBACK_ATTEMPTS)}個先まで順にずらす。明示的に指定した
                      ときはずらさずそのまま失敗する。0 を渡すと空きポートを使う）
  TSUKUMO_VIEW_PORT_FALLBACK_BASE
                      TSUKUMO_VIEW_PORT が未設定のときの既定の帯の起点を差し替える（既定
                      ${String(DEFAULT_VIEW_PORT)}。読めない値は無視して既定のまま）。日常の起動では使わない
                      ——実際の既定の帯を塞がずに「全部塞がっている」経路を確かめる
                      test/cli.test.ts のための口
  TSUKUMO_CHARACTER   キャラクター定義ディレクトリ（既定は tsukumo 自身の同梱の
                      characters/tsukumo-spirit。自分の素材を使うときは起動先の
                      characters/local などを指す。相対パスは cwd 相対、絶対パスはそのまま）
  TSUKUMO_OPEN_VIEW   起動時にタブを自動で開くか（既定は開く。0 を渡すと開かない）
  TSUKUMO_DRIVER      セッションの駆動（既定 sdk。fake は claude を起こさず疑似セッションを
                      流す）
  TSUKUMO_FAKE_SCENE  fake のとき、起こした直後に流す疑似セッションの場面の名前（既定は流さない。
                      依頼を送らずにその画面を出すための口で、状態のカタログを撮る
                      scripts/capture-catalog.ts が使う）
  TSUKUMO_NEW_SESSION 1 を渡すと前の続きから始めず、新しいセッションとして起こす
                      （この起動の間は、切り替えた先のキャラクターも新規から始まる）
  TSUKUMO_WATCH_UI    1 を渡すと src/browser/ を見張り、保存のたびに組み立て直して開いているタブへ
                      取り直しを押す（tsukumo 自身を直しながら動かすとき用。既定は見張らない。
                      src/server/core/ と src/shared/ を直したときは上げ直しが要る）
  TSUKUMO_HOME        tsukumo が自分の持ち物を置くホーム（既定 ~/.tsukumo。覚えたキャラクター・
                      雑談の要約とアーカイブ・トークンの記録・画面から作ったパックがこの下に並ぶ）。
                      **2つを並行して動かすときだけ**、TSUKUMO_VIEW_PORT と一緒に分けて渡す。
                      相対パスは cwd 相対、絶対パスはそのまま
  TSUKUMO_REPORT_TOOL 1 を渡すと、レポートを report ツールで受け取る（試行用。採否が決まったら
                      消す。既定はターンのテキストから選ぶ今までの受け取り方。雑談には効かない）
`

/**
 * 終了コードを返す。0 のときはビューサーバとセッションを残したままプロセスを生かし続けるので、
 * 呼び出し側は 0 以外のときだけ `process.exit` する。
 */
async function main(args: readonly string[]): Promise<number> {
  if (args.includes("--help")) {
    process.stdout.write(USAGE)
    return 0
  }

  // 環境変数を読むのはここだけ（解釈は src/server/core/config.ts）。
  return run(readConfig(process.env), readReportChannel(process.env))
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
