// tsukumo のエントリポイント。Agent SDK で Claude Code のセッションを起こし、届いたイベントを
// ビューに変えて、ローカルの HTTP サーバから配り続ける。
//
// ここは「配線」の層。引数・環境変数の受け取り、起動時の前提チェック、状態を1つ持つこと、
// 1回分の `try`/`catch` がここの仕事で、判断そのものは持たない。
//
// **いまは新旧2つの経路が並んで動く**（docs/design.md 12章の段2）。届いたイベントは
// (1) `session-manager` へ（WebSocket の `events` フレーム）と (2) 旧の `event-sink` へ
// （SSE で押す HTML）の両方へ流れる。段3以降、領域ごとに (2) が消えていく。

import { randomUUID } from "node:crypto"
import process from "node:process"

import { readConfig, VIEW_PORT_ENV_NAME } from "./core/config.ts"
import { readFakeScript, startFakeSession } from "./core/fake-driver.ts"
import { type Host } from "./core/host.ts"
import { createOrcaHost } from "./core/orca-host.ts"
import { attachSessionSocket, createStartupToken } from "./core/server.ts"
import { DEFAULT_PERMISSION_MODE, type SessionDriver, startSession } from "./core/session-driver.ts"
import { createSessionManager, EVENT_BATCH_INTERVAL_MS } from "./core/session-manager.ts"
import { watchTaskSummary } from "./core/task-summary.ts"
import {
  buildBrowserScript,
  buildStyleSheet,
  buildUiScript,
} from "./infrastructure/browser-bundle.ts"
import { resolveBundledDir } from "./infrastructure/bundled-path.ts"
import {
  DEFAULT_CHARACTER_DIR_RELATIVE_PATH,
  readCharacterAssets,
  readCharacterDefinition,
} from "./infrastructure/character-asset.ts"
import {
  DEFAULT_VIEW_PORT,
  resolveViewPort,
  startOnResolvedPort,
  VIEW_PORT_FALLBACK_ATTEMPTS,
} from "./infrastructure/view-port.ts"
import { startViewServer } from "./infrastructure/view-server.ts"
import { REPORT_NOTATION_PROMPT } from "./presentation/report-notation.ts"
import { buildCharacterBody, buildMainBody } from "./presentation/view.ts"
import { availableExpressions } from "./protocol/character.ts"
import { type SessionEvent } from "./protocol/session-event.ts"
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
  TSUKUMO_VIEW_PORT   ビューを配るポート（既定 ${String(DEFAULT_VIEW_PORT)}。既定のまま塞がっていたら
                      ${String(VIEW_PORT_FALLBACK_ATTEMPTS)}個先まで順にずらす。明示的に指定した
                      ときはずらさずそのまま失敗する。0 を渡すと空きポートを使う）
  TSUKUMO_CHARACTER   キャラクター定義ディレクトリ（既定は tsukumo 自身の同梱の
                      characters/tsukumo-spirit。自分の素材を使うときは起動先の
                      characters/local などを指す。相対パスは cwd 相対、絶対パスはそのまま）
  TSUKUMO_OPEN_VIEW   起動時にタブを自動で開くか（既定は開く。0 を渡すと開かない）
  TSUKUMO_DRIVER      セッションの駆動（既定 sdk。fake は claude を起こさず台本を流す）
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

  // 環境変数を読むのはここ1回だけ（src/core/config.ts）。
  const config = readConfig(process.env)

  // 起動時に前提（ポート番号として読める）が満たされていないときだけ即時終了する
  // （docs/coding-standards.md「エラーハンドリング」）。
  const portResolution = resolveViewPort(config.rawViewPort)
  if (portResolution.kind === "invalid") {
    process.stderr.write(`tsukumo: ${VIEW_PORT_ENV_NAME} がポート番号として読めない\n`)
    return 1
  }

  // ブラウザ側スクリプトと CSS は**起動のたびに組み立てる**（2026-09-12 T-083 決定、CSS も同じ形に
  // 乗せる）。ディスクに置かないので古い成果物を配る事故が起きず、`.ts` / `.css` を直して起こし直す
  // だけで反映される。組み立てに失敗したらページが動かないので、**ここは起動時の前提不足として
  // 即時終了する**（`docs/coding-standards.md`「常駐プロセスは描画1回の失敗で落ちない」の例外側）。
  const [browserScript, styleSheet, uiScript] = await Promise.all([
    buildBrowserScript(),
    buildStyleSheet(),
    buildUiScript(),
  ])
  if (browserScript === undefined) {
    process.stderr.write("tsukumo: ブラウザ側スクリプトを組み立てられない\n")
    return 1
  }
  if (styleSheet === undefined) {
    process.stderr.write("tsukumo: CSS を組み立てられない\n")
    return 1
  }
  if (uiScript === undefined) {
    process.stderr.write("tsukumo: ブラウザ側スクリプト（ui）を組み立てられない\n")
    return 1
  }

  // 偽の駆動を選んだときは台本が要る。無ければ起こす意味が無いので、起動時の前提不足として扱う。
  const fakeScript = config.driver === "fake" ? readFakeScript() : undefined
  if (config.driver === "fake" && fakeScript === undefined) {
    process.stderr.write("tsukumo: 偽の駆動の台本を読めない\n")
    return 1
  }

  const host = createOrcaHost()

  // ポートが塞がっているのは、既定を使っているときに限り「起動時の前提不足」として即時終了せず
  // ずらして再挑戦する（src/infrastructure/view-port.ts）。明示的に渡されたときは一度だけ試してそのまま失敗する。
  const startResult = await startOnResolvedPort(portResolution, (port) =>
    startViewServer(port, browserScript, styleSheet, uiScript),
  )
  if (!startResult.ok) {
    process.stderr.write(`tsukumo: ビューを配れない: ${startResult.reason}\n`)
    return 1
  }
  const server = startResult.server

  const characterDir = resolveBundledDir(
    config.character,
    process.cwd(),
    DEFAULT_CHARACTER_DIR_RELATIVE_PATH,
  )
  const publish = throttle(
    createViewPublisher(
      {
        readCharacterAssets: (expression, outfit) =>
          readCharacterAssets(characterDir, expression, outfit),
        buildCharacterBody,
        buildMainBody,
        publish: server.publish,
      },
      Date.now,
      () => process.stderr.write("tsukumo: ビューの更新に失敗した。次の更新を待つ\n"),
    ),
    PUBLISH_INTERVAL_MS,
  )

  // 旧の経路（SSE で押す HTML）。**新しい経路と同じイベントを受け取る購読者の1つ**として残す
  // （docs/design.md 12章の段2。入力欄は段4で WebSocket 側の `SessionState` だけを見るようになり、
  // ここへは何も渡さなくなった）。
  const sink = createEventSink(
    publish,
    (reason) => {
      process.stderr.write(`tsukumo: セッションが終わった: ${reason}\n`)
    },
    Date.now,
  )

  const sessionId = randomUUID()
  const manager = createSessionManager({
    now: Date.now,
    batchIntervalMs: EVENT_BATCH_INTERVAL_MS,
  })
  manager.create({
    sessionId,
    startDriver: (toFrames) => {
      // develop/tasks.json の見張りは core（サイドバーの React 側だけが `tasks` を読む。
      // 段3。旧の `sink` へは流さない — サイドバーはもう HTML を組み立てて配る側を持たない）。
      const taskWatcher = watchTaskSummary(process.cwd(), (tasks) => {
        toFrames({ kind: "tasks-changed", tasks })
      })
      const started = startDriver(
        {
          cwd: process.cwd(),
          expressions: availableExpressions(readCharacterDefinition(characterDir)),
          script: fakeScript,
        },
        (event) => {
          toFrames(event)
          sink(event)
        },
      )
      return {
        ...started,
        close: () => {
          taskWatcher.close()
          started.close()
        },
      }
    },
  })

  // 起動トークンは**このプロセスのメモリにだけ**置く（ディスクに書かない。docs/design.md 9章）。
  const token = createStartupToken()
  attachSessionSocket({
    httpServer: server.httpServer,
    token,
    origin: new URL(server.layoutUrl).origin,
    subscribe: (send) => manager.subscribe(sessionId, send),
    dispatch: (command) => manager.dispatch(sessionId, command),
  })

  const viewUrl = `${server.layoutUrl}?t=${token}`
  stopSessionOnExit(manager.close)
  announce(viewUrl)

  if (config.openView) {
    await openLayoutView(host, viewUrl)
  }

  return 0
}

/** 駆動を起こすときに要るもの。偽の駆動を選んだときだけ `script` が入る。 */
type DriverSeed = {
  readonly cwd: string
  readonly expressions: ReturnType<typeof availableExpressions>
  readonly script: ReturnType<typeof readFakeScript>
}

/**
 * セッション駆動を1つ起こす。**台本があれば偽の駆動**（claude を起こさない。
 * `TSUKUMO_DRIVER=fake`）、無ければ Agent SDK の駆動。
 */
function startDriver(seed: DriverSeed, onEvent: (event: SessionEvent) => void): SessionDriver {
  if (seed.script !== undefined) {
    return startFakeSession({ script: seed.script, onEvent })
  }

  return startSession({
    cwd: seed.cwd,
    expressions: seed.expressions,
    permissionMode: DEFAULT_PERMISSION_MODE,
    systemPromptAppend: REPORT_NOTATION_PROMPT,
    onEvent,
  })
}

/**
 * プロセスが終わるときにセッションを閉じる。**閉じないと claude の子プロセスが残る**ので、
 * 割り込み（Ctrl-C）と終了要求の両方で入力を閉じてから抜ける。
 */
function stopSessionOnExit(closeSessions: () => void): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      closeSessions()
      process.exit(0)
    })
  }
}

/**
 * レイアウトページのタブを開く。**失敗しても起動は続ける**（`orca` が無い環境では
 * `host.showView` が失敗を返すだけで例外は投げない。docs/coding-standards.md
 * 「エラーハンドリング」— 常駐プロセスは描画1回の失敗で落ちない）。
 */
async function openLayoutView(host: Host, url: string): Promise<void> {
  const result = await host.showView(url)
  if (!result.ok) {
    process.stderr.write(`tsukumo: ビューのタブを開けなかった: ${result.reason}\n`)
  }
}

// 起動したことと URL は、ペインに残る唯一の出力。ここに会話の内容は出さない
// （docs/coding-standards.md「会話内容の扱い」）。**URL には起動トークンが付く**ので、
// タブを開き直すときはこの URL をそのまま使う。
function announce(url: string): void {
  process.stdout.write(`tsukumo: ビューを配信中\n  ${url}\n`)
}

const exitCode = await main(process.argv.slice(2))
if (exitCode !== 0) {
  process.exit(exitCode)
}
