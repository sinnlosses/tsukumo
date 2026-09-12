// tsukumo のエントリポイント。Agent SDK で Claude Code のセッションを起こし、届いたイベントを
// HTML のビューに変えて、ローカルの HTTP サーバから配り続ける。
//
// ここは「配線」の層。引数・環境変数の受け取り、起動時の前提チェック、状態を1つ持つこと、
// 1回分の `try`/`catch` がここの仕事で、判断そのものは持たない。

import process from "node:process"

import { availableExpressions } from "./domain/character.ts"
import { type CommandDescription } from "./domain/session-event.ts"
import { resolveOpenView, OPEN_VIEW_ENV_NAME } from "./infrastructure/auto-open-view.ts"
import { buildBrowserScript, buildStyleSheet } from "./infrastructure/browser-bundle.ts"
import { resolveBundledDir } from "./infrastructure/bundled-path.ts"
import {
  CHARACTER_DIR_ENV_NAME,
  DEFAULT_CHARACTER_DIR_RELATIVE_PATH,
  readCharacterAssets,
  readCharacterDefinition,
} from "./infrastructure/character-asset.ts"
import { type Host } from "./infrastructure/host.ts"
import { createOrcaHost } from "./infrastructure/orca-host.ts"
import {
  DEFAULT_PERMISSION_MODE,
  type SessionDriver,
  startSession,
} from "./infrastructure/session-driver.ts"
import { createTaskSummaryReader } from "./infrastructure/task-summary.ts"
import {
  DEFAULT_VIEW_PORT,
  resolveViewPort,
  startOnResolvedPort,
  VIEW_PORT_ENV_NAME,
  VIEW_PORT_FALLBACK_ATTEMPTS,
} from "./infrastructure/view-port.ts"
import { startViewServer, type ViewServer } from "./infrastructure/view-server.ts"
import {
  buildCharacterBody,
  buildMainBody,
  buildPendingAnswerBody,
  buildSidebarBody,
} from "./presentation/view.ts"
import { createEventSink } from "./usecase/event-sink.ts"
import { throttle } from "./usecase/throttle.ts"
import { createViewPublisher } from "./usecase/view-publish.ts"

const USAGE = `tsukumo — キャラクターと一緒に仕事をするためのターミナル環境

使い方:
  tsukumo   （プロジェクトのディレクトリで打つ。開発中はリポジトリ直下の bun run start でも同じ）

起動すると Claude Code のセッションが立ち上がり、ビューの配信とレイアウトページのタブを
開くところまで1コマンドで進む。**セッションは毎回新規**で、再開はしない。カレントディレクトリを
作業対象にする（claude を打つのと同じ感覚）。

環境変数:
  TSUKUMO_VIEW_PORT       ビューを配るポート（既定 ${String(DEFAULT_VIEW_PORT)}。既定のまま塞がっていたら
                          ${String(VIEW_PORT_FALLBACK_ATTEMPTS)}個先まで順にずらす。明示的に指定した
                          ときはずらさずそのまま失敗する。0 を渡すと空きポートを使う）
  TSUKUMO_CHARACTER_DIR   キャラクター定義ディレクトリ（既定は tsukumo 自身の同梱の
                          characters/tsukumo-spirit。自分の素材を使うときは起動先の
                          characters/local などを指す。相対パスは cwd 相対、絶対パスはそのまま）
  TSUKUMO_OPEN_VIEW       起動時にタブを自動で開くか（既定は開く。0 を渡すと開かない）
`

// ビューを配り直す間隔。本文はトークン単位で流れてくるので、断片1つごとに全ビューを組み直すと
// 無駄が大きい。まとめて配ることで転送量を抑える（反映の遅延目安は1秒以内。
// docs/requirements.md「5. 実行環境・非機能要件」）。
const PUBLISH_INTERVAL_MS = 100

/**
 * 終了コードを返す。0 のときはビューサーバとセッションを残したままプロセスを生かし続けるので、
 * 呼び出し側は 0 以外のときだけ `process.exit` する。
 */
async function main(args: readonly string[]): Promise<number> {
  if (args.includes("--help")) {
    process.stdout.write(USAGE)
    return 0
  }

  // 起動時に前提（ポート番号として読める）が満たされていないときだけ即時終了する
  // （docs/coding-standards.md「エラーハンドリング」）。
  const portResolution = resolveViewPort(process.env[VIEW_PORT_ENV_NAME])
  if (portResolution.kind === "invalid") {
    process.stderr.write(`tsukumo: ${VIEW_PORT_ENV_NAME} がポート番号として読めない\n`)
    return 1
  }

  // ブラウザ側スクリプトと CSS は**起動のたびに組み立てる**（2026-09-12 T-083 決定、CSS も同じ形に
  // 乗せる）。ディスクに置かないので古い成果物を配る事故が起きず、`.ts` / `.css` を直して起こし直す
  // だけで反映される。組み立てに失敗したらページが動かないので、**ここは起動時の前提不足として
  // 即時終了する**（`docs/coding-standards.md`「常駐プロセスは描画1回の失敗で落ちない」の例外側）。
  const [browserScript, styleSheet] = await Promise.all([buildBrowserScript(), buildStyleSheet()])
  if (browserScript === undefined) {
    process.stderr.write("tsukumo: ブラウザ側スクリプトを組み立てられない\n")
    return 1
  }
  if (styleSheet === undefined) {
    process.stderr.write("tsukumo: CSS を組み立てられない\n")
    return 1
  }

  const host = createOrcaHost()

  // ビューサーバとセッションは互いを必要とする（サーバは依頼をセッションへ渡し、セッションは
  // 配るためにサーバを要る）。**先に立てるのはサーバ**にして、セッションはあとから入る形にした。
  // 起動直後の依頼は受け取れずに 503 で返るだけで、どちらかが欠けて黙って落ちることがない。
  let driver: SessionDriver | undefined = undefined
  // 入力欄の `/` 補完の候補（`GET /api/commands` が読む）。init 前は空配列
  // （docs/requirements.md 4.2「入力欄」）。session-view.ts が端末専用を除いた名前に説明を
  // 添える計算（`commandSuggestions`）を済ませたものをそのまま持つ。
  let commands: readonly CommandDescription[] = []
  // ポートが塞がっているのは、既定を使っているときに限り「起動時の前提不足」として即時終了せず
  // ずらして再挑戦する（src/infrastructure/view-port.ts）。明示的に渡されたときは一度だけ試してそのまま失敗する。
  const startResult = await startOnResolvedPort(portResolution, (port) =>
    startViewServer(
      port,
      (text) => {
        if (driver === undefined) {
          return false
        }
        driver.prompt(text)
        return true
      },
      () => (driver === undefined ? Promise.resolve() : driver.interrupt()),
      (id, answer) => (driver === undefined ? false : driver.answer(id, answer)),
      (mode) =>
        driver === undefined
          ? Promise.resolve(false)
          : driver.setPermissionMode(mode).then(() => true),
      (model) =>
        driver === undefined ? Promise.resolve(false) : driver.setModel(model).then(() => true),
      () => commands,
      browserScript,
      styleSheet,
    ),
  )
  if (!startResult.ok) {
    process.stderr.write(`tsukumo: ビューを配れない: ${startResult.reason}\n`)
    return 1
  }
  const server = startResult.server

  const characterDir = resolveBundledDir(
    process.env[CHARACTER_DIR_ENV_NAME],
    process.cwd(),
    DEFAULT_CHARACTER_DIR_RELATIVE_PATH,
  )
  const readTaskSummary = createTaskSummaryReader(process.cwd())
  const publish = throttle(
    createViewPublisher(
      {
        readCharacterAssets: (expression, outfit) =>
          readCharacterAssets(characterDir, expression, outfit),
        buildCharacterBody,
        buildMainBody,
        buildSidebarBody,
        publish: server.publish,
      },
      readTaskSummary,
      Date.now,
      () => process.stderr.write("tsukumo: ビューの更新に失敗した。次の更新を待つ\n"),
    ),
    PUBLISH_INTERVAL_MS,
  )

  driver = startSession({
    cwd: process.cwd(),
    expressions: availableExpressions(readCharacterDefinition(characterDir)),
    permissionMode: DEFAULT_PERMISSION_MODE,
    onEvent: createEventSink(
      publish,
      server.publishTurnStatus,
      (pending) => {
        server.publishPendingAnswer(buildPendingAnswerBody(pending))
      },
      (next) => {
        commands = next
      },
      (reason) => {
        process.stderr.write(`tsukumo: セッションが終わった: ${reason}\n`)
      },
      Date.now,
    ),
  })
  stopSessionOnExit(driver)
  announce(server)

  if (resolveOpenView(process.env[OPEN_VIEW_ENV_NAME])) {
    await openLayoutView(host, server)
  }

  return 0
}

/**
 * プロセスが終わるときにセッションを閉じる。**閉じないと claude の子プロセスが残る**ので、
 * 割り込み（Ctrl-C）と終了要求の両方で入力を閉じてから抜ける。
 */
function stopSessionOnExit(driver: SessionDriver): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      driver.close()
      process.exit(0)
    })
  }
}

/**
 * レイアウトページのタブを開く。**失敗しても起動は続ける**（`orca` が無い環境では
 * `host.showView` が失敗を返すだけで例外は投げない。docs/coding-standards.md
 * 「エラーハンドリング」— 常駐プロセスは描画1回の失敗で落ちない）。
 */
async function openLayoutView(host: Host, server: ViewServer): Promise<void> {
  const result = await host.showView(server.layoutUrl)
  if (!result.ok) {
    process.stderr.write(`tsukumo: ビューのタブを開けなかった: ${result.reason}\n`)
  }
}

// 起動したことと URL は、ペインに残る唯一の出力。ここに会話の内容は出さない
// （docs/coding-standards.md「会話内容の扱い」）。
// 利用者が実際に開くのは layoutUrl（3領域をまとめた1枚）だけ。個別ビューのページは
// 2026-09-12 に消した（`docs/architecture.md`「ビューは1枚のページにまとめる」）。
function announce(server: ViewServer): void {
  process.stdout.write(`tsukumo: ビューを配信中\n  ${server.layoutUrl}\n`)
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
