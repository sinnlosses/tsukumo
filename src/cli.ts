// tsukumo のエントリポイント。Agent SDK で Claude Code のセッションを起こし、届いたイベントを
// `session-manager` に渡して WebSocket のフレームとして配り続ける。
//
// ここは「配線」の層。引数・環境変数の受け取り、起動時の前提チェック、状態を1つ持つこと、
// 1回分の `try`/`catch` がここの仕事で、判断そのものは持たない。`protocol` / `core` / `ui` の
// すべてを import してよい唯一の場所（docs/design.md 2章「層と依存の向き」）。

import { randomUUID } from "node:crypto"
import process from "node:process"

import { buildStyleSheet, buildUiScript } from "./core/bundle.ts"
import { resolveBundledDir } from "./core/bundled-path.ts"
import {
  buildSystemPromptAppend,
  type CharacterPack,
  characterChangedEvent,
  DEFAULT_CHARACTER_DIR_RELATIVE_PATH,
  listCharacterPacks,
  readCharacterPack,
  readCharacterPackFile,
  toCharacterPackChoices,
} from "./core/character-pack.ts"
import { type Config, readConfig, sessionTag, VIEW_PORT_ENV_NAME } from "./core/config.ts"
import { readFakeScript, startFakeSession } from "./core/fake-driver.ts"
import { type Host } from "./core/host.ts"
import { createOrcaHost } from "./core/orca-host.ts"
import {
  DEFAULT_VIEW_PORT,
  resolveViewPort,
  startOnResolvedPort,
  VIEW_PORT_FALLBACK_ATTEMPTS,
} from "./core/port-resolution.ts"
import { readRememberedCharacter, writeRememberedCharacter } from "./core/remembered-character.ts"
import { REPORT_NOTATION_PROMPT } from "./core/report-notation.ts"
import { attachSessionSocket, createStartupToken, startViewServer } from "./core/server.ts"
import {
  DEFAULT_PERMISSION_MODE,
  findSessionToResume,
  readRestoredEvents,
  type SessionDriver,
  startSession,
} from "./core/session-driver.ts"
import { createSessionManager, EVENT_BATCH_INTERVAL_MS } from "./core/session-manager.ts"
import { watchTaskSummary } from "./core/task-summary.ts"
import { watchUiSource } from "./core/ui-rebuild.ts"
import { type ExpressionChoice, expressionChoices } from "./protocol/character.ts"
import { type RefreshTarget, type ServerFrame } from "./protocol/frame.ts"
import { type SessionEvent } from "./protocol/session-event.ts"

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
  TSUKUMO_CHARACTER   キャラクター定義ディレクトリ（既定は tsukumo 自身の同梱の
                      characters/tsukumo-spirit。自分の素材を使うときは起動先の
                      characters/local などを指す。相対パスは cwd 相対、絶対パスはそのまま）
  TSUKUMO_OPEN_VIEW   起動時にタブを自動で開くか（既定は開く。0 を渡すと開かない）
  TSUKUMO_DRIVER      セッションの駆動（既定 sdk。fake は claude を起こさず台本を流す）
  TSUKUMO_NEW_SESSION 1 を渡すと前の続きから始めず、新しいセッションとして起こす
                      （この起動の間は、切り替えた先のキャラクターも新規から始まる）
  TSUKUMO_WATCH_UI    1 を渡すと src/ui/ を見張り、保存のたびに組み立て直して開いているタブへ
                      取り直しを押す（tsukumo 自身を直しながら動かすとき用。既定は見張らない。
                      src/core/ と src/protocol/ を直したときは上げ直しが要る）
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

  // 環境変数を読むのはここ1回だけ（src/core/config.ts）。
  const config = readConfig(process.env)

  // 起動時に前提（ポート番号として読める）が満たされていないときだけ即時終了する
  // （docs/coding-standards.md「エラーハンドリング」）。
  const portResolution = resolveViewPort(config.rawViewPort)
  if (portResolution.kind === "invalid") {
    process.stderr.write(`tsukumo: ${VIEW_PORT_ENV_NAME} がポート番号として読めない\n`)
    return 1
  }

  // ブラウザ側スクリプトと CSS は**起動のたびに組み立てる**（2026-09-12 決定、CSS も同じ形に
  // 乗せる）。ディスクに置かないので古い成果物を配る事故が起きず、`.ts` / `.css` を直して起こし直す
  // だけで反映される。組み立てに失敗したらページが動かないので、**ここは起動時の前提不足として
  // 即時終了する**（`docs/coding-standards.md`「常駐プロセスは描画1回の失敗で落ちない」の例外側）。
  const [styleSheet, uiScript] = await Promise.all([buildStyleSheet(), buildUiScript()])
  if (styleSheet === undefined) {
    process.stderr.write("tsukumo: CSS を組み立てられない\n")
    return 1
  }
  if (uiScript === undefined) {
    process.stderr.write("tsukumo: ブラウザ側スクリプトを組み立てられない\n")
    return 1
  }
  // 組み立てたものの持ち主はここ（ディスクに置かない）。**`TSUKUMO_WATCH_UI` のときだけ
  // 組み立て直したものへ丸ごと差し替わる**ので、サーバには取り出し口だけを渡す。
  let viewAssets = { uiScript, styleSheet }

  // 偽の駆動を選んだときは台本が要る。無ければ起こす意味が無いので、起動時の前提不足として扱う。
  const fakeScript = config.driver === "fake" ? readFakeScript() : undefined
  if (config.driver === "fake" && fakeScript === undefined) {
    process.stderr.write("tsukumo: 偽の駆動の台本を読めない\n")
    return 1
  }

  const host = createOrcaHost()

  // 切り替えの選択肢（サイドバーの `<select>`）と、いま出しているパック。**パックは
  // `switch-character` で入れ替わる**ので、この1つだけを配線層が持ち回る
  // （立ち絵を配る `/character/<file>` も、駆動に渡す表情・人格もここを見る）。
  const defaultPack = readCharacterPack(
    resolveBundledDir(config.character, process.cwd(), DEFAULT_CHARACTER_DIR_RELATIVE_PATH),
  )
  const found = listCharacterPacks(process.cwd())
  // 既定のパックが一覧に無いとき（`TSUKUMO_CHARACTER` で別の場所を指したとき）も選択肢に足す
  // （いま出しているものが `<select>` に無いと、選択の表示がずれる）。
  const packs = found.some((pack) => pack.name === defaultPack.name)
    ? found
    : [...found, defaultPack]
  const packChoices = toCharacterPackChoices(packs)
  // 知らない名前が来たら既定に落ちる（名前をパスとして組み立てない。docs/design.md 7章）。
  const selectPack = (name: string | undefined): CharacterPack =>
    packs.find((pack) => pack.name === name) ?? defaultPack

  // 起動時の初期パック。優先順位は TSUKUMO_CHARACTER（config.character）> 覚えた値 > 同梱の既定
  // （docs/design.md 13.6「第3の扱い」）。TSUKUMO_CHARACTER があるときはすでに defaultPack に
  // 反映されているので覚えた値は見ない。無ければ覚えた名前を packs から引き、一覧に無ければ
  // selectPack の既定（defaultPack）へ落ちる。
  const remembered = config.character === undefined ? readRememberedCharacter() : undefined
  const initialPack = remembered === undefined ? defaultPack : selectPack(remembered)
  let characterPack = initialPack

  // ポートが塞がっているのは、既定を使っているときに限り「起動時の前提不足」として即時終了せず
  // ずらして再挑戦する（src/core/port-resolution.ts）。明示的に渡されたときは一度だけ試してそのまま失敗する。
  const startResult = await startOnResolvedPort(portResolution, (port) =>
    startViewServer(
      port,
      { uiScript: () => viewAssets.uiScript, styleSheet: () => viewAssets.styleSheet },
      (fileName) => readCharacterPackFile(characterPack, fileName),
    ),
  )
  if (!startResult.ok) {
    process.stderr.write(`tsukumo: ビューを配れない: ${startResult.reason}\n`)
    return 1
  }
  const server = startResult.server

  const sessionId = randomUUID()
  const manager = createSessionManager({
    now: Date.now,
    batchIntervalMs: EVENT_BATCH_INTERVAL_MS,
  })
  manager.create({
    sessionId,
    startDriver: async (toFrames, character) => {
      // **`character` が入っているのは `switch-character` で起こし直したときだけ。**
      // 無ければ起動時の初期パック（覚えた値、または同梱の既定）。パックが決まったら、
      // 立ち絵の取り先と選択肢を1回流す（docs/design.md 7章）。
      characterPack = character === undefined ? initialPack : selectPack(character)
      // **覚えるのは画面から選んだときだけ。** 起動時にも書くと、その回だけの指定
      // （TSUKUMO_CHARACTER）や同梱の既定が次の起動の初期値として残ってしまう
      // （環境変数は「その回の上書き」なので残さない。docs/design.md 13.6）。
      if (character !== undefined) {
        writeRememberedCharacter(characterPack.name)
      }
      toFrames(characterChangedEvent(characterPack, packChoices))

      // develop/tasks.json の見張り。サイドバーの React の部品が `tasks-changed` を状態に畳んで読む
      // （段3。docs/design.md 12章）。
      const taskWatcher = watchTaskSummary(process.cwd(), (tasks) => {
        toFrames({ kind: "tasks-changed", tasks })
      })
      // **キャラクターごとに別のセッションを持つ**（docs/design.md 7章）。起動時も切り替え時も、
      // これから起こすパックの印を持つ最新のセッションを探して続きから始める。
      const resume = await findPackSessionToResume(config, process.cwd(), characterPack.name)
      const expressions = expressionChoices(characterPack.definition)
      const started = startDriver(
        {
          cwd: process.cwd(),
          expressions,
          persona: characterPack,
          script: fakeScript,
          resume,
        },
        toFrames,
      )

      // 続きから始まったことは、履歴が組み上がるのを待たずに画面へ出す（サイドバーの
      // 「セッション情報」。docs/requirements.md 4.8「いつ復元するか」）。
      if (resume !== undefined) {
        toFrames({ kind: "session-restored", sessionId: resume })
        void replayRestoredSession(resume, process.cwd(), expressions, toFrames)
      }

      return {
        ...started,
        close: () => {
          taskWatcher.close()
          started.close()
        },
      }
    },
  })

  // 開いているタブ。**セッションのイベントとは別に押したいもの**（いまは `refresh` だけ）が
  // あるので、購読を manager に渡すついでにここでも持つ。
  const viewers = new Set<(frame: ServerFrame) => void>()

  // 起動トークンは**このプロセスのメモリにだけ**置く（ディスクに書かない。docs/design.md 9章）。
  const token = createStartupToken()
  attachSessionSocket({
    httpServer: server.httpServer,
    token,
    origin: new URL(server.layoutUrl).origin,
    subscribe: (send) => {
      viewers.add(send)
      const unsubscribe = manager.subscribe(sessionId, send)
      return () => {
        viewers.delete(send)
        unsubscribe()
      }
    },
    dispatch: (command) => manager.dispatch(sessionId, command),
  })

  if (config.watchUi) {
    watchUiSource({
      onRebuilt: (rebuilt) => {
        viewAssets = { uiScript: rebuilt.uiScript, styleSheet: rebuilt.styleSheet }
        pushRefresh(viewers, rebuilt.target)
      },
      // 組み立て直せなくても前の版が配られたままなので、知らせるだけで続ける。
      onFailure: (reason) => process.stderr.write(`tsukumo: ${reason}\n`),
    })
  }

  const viewUrl = `${server.layoutUrl}?t=${token}`
  stopSessionOnExit(manager.close)
  announce(viewUrl)

  if (config.openView) {
    await openLayoutView(host, viewUrl)
  }

  return 0
}

/**
 * 開いているタブに取り直しを押す。**セッションの状態は動かない**ので `session-manager` を
 * 通さない（docs/design.md 11章）。
 */
function pushRefresh(
  viewers: ReadonlySet<(frame: ServerFrame) => void>,
  target: RefreshTarget,
): void {
  for (const send of viewers) {
    send({ type: "refresh", target })
  }
}

/** 駆動を起こすときに要るもの。偽の駆動を選んだときだけ `script` が入る。 */
type DriverSeed = {
  readonly cwd: string
  readonly expressions: readonly ExpressionChoice[]
  /** 人格を持つキャラクターパック（`systemPrompt` の append を組み立てるために渡す）。 */
  readonly persona: CharacterPack
  readonly script: ReturnType<typeof readFakeScript>
  /** 続きから始めるセッションのID（新規に起こすときは undefined）。 */
  readonly resume: string | undefined
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
    systemPromptAppend: buildSystemPromptAppend(seed.persona, REPORT_NOTATION_PROMPT),
    resume: seed.resume,
    tag: sessionTag(seed.persona.name),
    onEvent,
  })
}

/**
 * これから起こすキャラクターパックの、続きから始めるセッションを探す（docs/requirements.md 4.8）。
 * 無ければ undefined（新規に起こす）。
 *
 * **印はターンが終わって3秒後に付く**ので、ターンを1つも終えずに離れたパックのセッションは
 * 次に来たときに見つからず、新規から始まる（`SESSION_TAG_DELAY_MS`。4.8「復元できなかったとき
 * どうするか」の範囲）。偽の駆動は claude を起こさないので、そもそも探さない。
 */
async function findPackSessionToResume(
  config: Config,
  cwd: string,
  characterName: string,
): Promise<string | undefined> {
  return config.newSession || config.driver === "fake"
    ? undefined
    : findSessionToResume(cwd, sessionTag(characterName))
}

/**
 * 前のセッションの記録（メインビューのやり取りと吹き出しのセリフ）を組み直して流す。
 * **claude 側の会話は `resume` が繋いでいる**ので、ここが失敗しても続行する（読めなかったぶんの
 * 履歴が画面に出ないだけ。docs/requirements.md 4.8「復元できなかったときどうするか」）。
 *
 * 組み上がるのはこのプロセスのメモリの中だけで、**どこにも書き出さない**
 * （docs/coding-standards.md「会話内容の扱い」）。
 */
async function replayRestoredSession(
  sessionId: string,
  cwd: string,
  expressions: readonly ExpressionChoice[],
  onEvent: (event: SessionEvent) => void,
): Promise<void> {
  for (const event of await readRestoredEvents(sessionId, cwd, expressions)) {
    onEvent(event)
  }
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
