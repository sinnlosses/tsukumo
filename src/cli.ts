// tsukumo のエントリポイント。
// 引数の受け取り・環境変数の読み出し・終了コードの返し方だけを持ち、起動の段取りは `run` が進める。

import process from "node:process"

import { run } from "./main.ts"
import {
  delegateToCheckout,
  readCwdCheckout,
  readOwnCheckoutRoot,
} from "./server/checkout/adapter/checkout-launch.ts"
import { decideCheckoutDelegation } from "./server/checkout/core/checkout-delegation.ts"
import { readConfig } from "./server/core/config.ts"
import {
  DEFAULT_VIEW_PORT,
  VIEW_PORT_FALLBACK_ATTEMPTS,
} from "./server/view-server/core/port-resolution.ts"

const USAGE = `tsukumo — キャラクターと一緒に仕事をするためのターミナル環境

使い方:
  tsukumo   （プロジェクトのディレクトリで打つ。開発中はリポジトリ直下の pnpm run start でも同じ）

引数:
  --dev     Vite の開発サーバを差し込み、src/browser/ の保存を画面の状態を保ったまま当てる
            （tsukumo 自身を直しながら動かすとき用。pnpm run dev が渡す。src/ の browser 以外を
            直したときは上げ直しが要る）

起動すると Claude Code のセッションが立ち上がり、ビューの配信とレイアウトページのタブを
開くところまで1コマンドで進む。**セッションは常に新規から始まる**（前のセッションへは、
画面の切り替えか迎える口の「前回の続き」から戻る。docs/requirements.md「セッションの復元」）。
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
  TSUKUMO_FAKE_SCENE_UNTIL  名指しした場面の手を先頭から何個まで流すか（正の整数。既定は全部。
                      場面の途中の画を撮る scripts/capture-view.ts の --until-step が使う）
  TSUKUMO_HOME        tsukumo が自分の持ち物を置くホーム（既定 ~/.tsukumo。覚えたキャラクター・
                      雑談の要約とアーカイブ・トークンの記録・画面から作ったパックがこの下に並ぶ）。
                      **2つを並行して動かすときだけ**、TSUKUMO_VIEW_PORT と一緒に分けて渡す。
                      相対パスは cwd 相対、絶対パスはそのまま
`

/**
 * 終了コードを返す。0 のときはビューサーバとセッションを残したままプロセスを生かし続けるので、
 * 呼び出し側は 0 以外のときだけ `process.exit` する。
 */
async function main(args: readonly string[], cwd: string): Promise<number> {
  if (args.includes("--help")) {
    process.stdout.write(USAGE)
    return 0
  }

  // 環境変数と起こしたディレクトリを読むのはここだけで、環境変数の解釈は `readConfig` が持つ。
  // 写しを渡すのは、Vite の開発サーバ（`startUiDevServer`）があとで `process.env.NODE_ENV` を
  // 書き換えても、claude の子プロセスへ渡す環境に混ざらないようにするため。
  return run(readConfig({ ...process.env }), { devServer: args.includes("--dev"), cwd })
}

/**
 * 打った場所が別のチェックアウトの中なら、そこの bin/tsukumo へ委ねた結果の終了コードを返す。
 * 自分を起こしてよいときは `undefined`。
 */
async function delegatedExitCode(
  args: readonly string[],
  cwd: string,
): Promise<number | undefined> {
  const delegation = decideCheckoutDelegation(readOwnCheckoutRoot(), readCwdCheckout(cwd))
  if (delegation.kind === "delegate") {
    return delegateToCheckout(delegation.entry, args)
  }
  if (delegation.kind === "mismatch") {
    process.stderr.write(`${delegation.message}\n`)
    return 1
  }

  return undefined
}

const args = process.argv.slice(2)
const cwd = process.cwd()
const delegated = await delegatedExitCode(args, cwd)
if (delegated !== undefined) {
  process.exit(delegated)
}

const exitCode = await main(args, cwd)
if (exitCode !== 0) {
  process.exit(exitCode)
}
