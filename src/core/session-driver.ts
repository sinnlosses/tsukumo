// セッション駆動。Agent SDK で Claude Code を子プロセスとして起こし、届いたメッセージを
// 内部イベントに変えて流す（docs/glossary.md「セッション駆動」）。
//
// **`@anthropic-ai/claude-agent-sdk` を import するのはこのファイルだけ**（原則3。`orca` を
// 呼ぶのが src/core/orca-host.ts だけなのと同じ扱い）。SDK の語彙を外へ漏らさないため、外に出す型は
// このファイルで定義し直すか protocol から取る。
//
// **セッションは1プロセスに1つ**。起こし直したときは前の続きから始める（`resume`。
// docs/requirements.md 4.8「セッションの復元」。選ぶ計算は src/core/session-restore.ts）。
//
// 会話の内容（本文・ツールの入出力・セリフ）がここを通るが、**ログにもファイルにも書かない**
// （docs/coding-standards.md「会話内容の扱い」）。stderr に出すのは SDK 自身のエラー文だけ。

import {
  createSdkMcpServer,
  type EffortLevel,
  getSessionMessages,
  listSessions,
  type PermissionResult,
  query,
  type SDKUserMessage,
  tagSession,
  tool,
} from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import {
  type ExpressionChoice,
  expressionNames as toExpressionNames,
} from "../protocol/character.ts"
import { type ModelAlias, type PermissionMode } from "../protocol/command.ts"
import { type Expression } from "../protocol/expression.ts"
import { type Answer, type PendingAsk } from "../protocol/pending-ask.ts"
import { type SessionEvent } from "../protocol/session-event.ts"
import { createPendingAnswerQueue, type PendingAnswerQueue } from "./pending-answer.ts"
import {
  SPEAK_MCP_SERVER_NAME,
  SPEAK_TOOL_NAME,
  toCommandDescriptions,
  toSessionEvents,
} from "./sdk-message.ts"
import { selectSessionToResume, toRestoredEvents } from "./session-restore.ts"

/**
 * 既定の許可モード。`auto` は Claude Code 側が読み取り専用の操作を自動で通し、書き込みなどは
 * `canUseTool` に回す（2026-09-11 実測。docs/requirements.md 4.1）。
 *
 * **許可モードとモデルの値の一覧そのものは protocol にある**（`src/protocol/command.ts` の
 * `PERMISSION_MODES` / `MODEL_ALIASES`。docs/design.md 4.3）。SDK の型と同じ値であることは
 * test/core/session-driver.test.ts が型で確かめる。
 */
export const DEFAULT_PERMISSION_MODE: PermissionMode = "auto"

/**
 * 既定のモデル。ユーザーの指示（2026-09-12）で Opus に固定した
 * （docs/requirements.md 4.1）。画面の `<select>` 側の見た目上の既定値
 * （`src/ui/sidebar/session-info.tsx` の `MODEL_FALLBACK`）も同じ値に揃える。
 */
export const DEFAULT_MODEL: ModelAlias = "opus"

/**
 * 既定の reasoning effort。ユーザーの指示（2026-09-12）で high に固定した
 * （docs/requirements.md 4.1）。画面には出さない（設定するだけ）。
 */
export const DEFAULT_EFFORT: EffortLevel = "high"

/**
 * ターンが終わってから印（`tagSession`）を付け直すまでの待ち。**本体もターンの終わりに
 * セッションの要約を自分で書き、そこに印が含まれない**ので、書き込みと重なると印が消える
 * （2026-09-13 実測: `init` の直後・`result` の直後に付けた印はどちらも消え、ターンの3秒後に
 * 付けた印は入力を閉じたあとまで残った）。**ターンが終わるたびに付け直す**ので、途中の1回が
 * 消えても次のターンで戻る。
 */
const SESSION_TAG_DELAY_MS = 3_000

/** モデルに見せる `speak` ツールの説明。**セリフと本文の境目はここだけで説明する。** */
const SPEAK_TOOL_DESCRIPTION =
  "キャラクターがユーザーに向けて話す。掛け声・呼びかけ・リアクション・感想・完了報告はこのツールで言う。" +
  "手順・コード・表・判断とその理由は本文に書き、ここには入れない。"

export type SessionDriverOptions = {
  /** セッションの作業ディレクトリ。 */
  readonly cwd: string
  /** `speak` の `expression` で受け付ける表情と、そのラベル（キャラクターパックから作る）。 */
  readonly expressions: readonly ExpressionChoice[]
  readonly permissionMode: PermissionMode
  /**
   * `systemPrompt` に足す文字列（人格とレポートの記法。組み立ては
   * `src/core/character-pack.ts` の `buildSystemPromptAppend`）。**中身をこのファイルが
   * 決めない**（docs/design.md 5章）。
   */
  readonly systemPromptAppend: string
  /**
   * 続きから始めるセッションのID（undefined なら新規に起こす。docs/requirements.md 4.8）。
   * 選ぶのは {@link findSessionToResume}。
   */
  readonly resume: string | undefined
  /**
   * このセッションに付ける印（組み立ては `src/core/config.ts` の `sessionTag`。キャラクター
   * パックごとに違う）。**ターンが終わるたびに付け直す**（次に起こしたときに、これでそのパックの
   * セッションだけを見分ける。付け直す理由は {@link SESSION_TAG_DELAY_MS}）。
   */
  readonly tag: string
  /** 内部イベントの受け取り口。**ここで例外を投げないこと**（投げるとセッションが終わる）。 */
  readonly onEvent: (event: SessionEvent) => void
}

export type SessionDriver = {
  /** 依頼を1つ送る（ストリーミング入力への追加）。`request` イベントも同時に流れる。 */
  readonly prompt: (text: string) => void
  /** 実行中のターンを中断する。中断されたターンは `turn-finished` の `error` で終わる。 */
  readonly interrupt: () => Promise<void>
  /** 答え待ちに答える。解決済み・知らない id のときは `false`。 */
  readonly answer: (id: string, answer: Answer) => boolean
  /** いまの答え待ち（画面を組み直すときに使う）。 */
  readonly pending: () => readonly PendingAsk[]
  /** モデルを切り替える（画面からの切り替えは後続タスクで配線する）。 */
  readonly setModel: (model: string | undefined) => Promise<void>
  /** 許可モードを切り替える（画面からの切り替えは後続タスクで配線する）。 */
  readonly setPermissionMode: (mode: PermissionMode) => Promise<void>
  /** 入力を閉じてセッションを終える。子プロセスも止まる。 */
  readonly close: () => void
}

/**
 * セッションを起こす。**この関数は待たない**（`query()` の反復はバックグラウンドで回り続け、
 * 結果は `onEvent` に流れる）。
 *
 * 反復が例外で終わったら `session-ended` を流すだけで、**プロセスは落とさない**
 * （docs/coding-standards.md「エラーハンドリング」）。`try`/`catch` は反復を包む1つだけに
 * まとめてある。
 */
export function startSession(options: SessionDriverOptions): SessionDriver {
  const input = createPromptStream()
  const queue = createPendingAnswerQueue((pending) => {
    options.onEvent({ kind: "pending-changed", pending })
  })

  const session = query({
    prompt: input.stream(),
    options: {
      ...buildQuerySeedOptions(options),
      mcpServers: { [SPEAK_MCP_SERVER_NAME]: speakServer(options.expressions) },
      canUseTool: (toolName, toolInput, { signal, toolUseID }) =>
        askForAnswer(queue, toolUseID, toolName, toolInput, signal),
    },
  })

  void applyNeutralOutputStyle(session)
  void relayMessages(session, options)
  void relayCommandDescriptions(session, options)

  return {
    prompt: (text) => {
      options.onEvent({ kind: "request", text })
      input.push(text)
    },
    interrupt: async () => {
      await session.interrupt()
    },
    answer: (id, answer) => queue.answer(id, answer),
    pending: () => queue.list(),
    setModel: (model) => session.setModel(model),
    setPermissionMode: (mode) => session.setPermissionMode(mode),
    close: () => {
      input.end()
    },
  }
}

/** `query()` の `options` のうち、`mcpServers` / `canUseTool`（クロージャが要る）を除いた部分。 */
export type QuerySeedOptions = {
  readonly cwd: string
  readonly includePartialMessages: true
  readonly systemPrompt: {
    readonly type: "preset"
    readonly preset: "claude_code"
    readonly append: string
  }
  readonly permissionMode: PermissionMode
  readonly model: string
  readonly effort: EffortLevel
  /** 続きから始めるセッションのID。新規に起こすときは undefined（SDK 側は省略と同じ扱い）。 */
  readonly resume: string | undefined
}

/**
 * `query()` に渡す `options` のうち、クロージャを含まない部分を組み立てる。**本物の
 * `query()` を呼ばずに既定値（{@link DEFAULT_MODEL} / {@link DEFAULT_EFFORT}）が渡る形を
 * 検査できるように、`startSession` から切り出してある。**
 */
export function buildQuerySeedOptions(options: SessionDriverOptions): QuerySeedOptions {
  return {
    cwd: options.cwd,
    includePartialMessages: true,
    systemPrompt: { type: "preset", preset: "claude_code", append: options.systemPromptAppend },
    permissionMode: options.permissionMode,
    model: DEFAULT_MODEL,
    effort: DEFAULT_EFFORT,
    resume: options.resume,
  }
}

/**
 * 続きから始めるセッションを探す（起動時と、キャラクターを切り替えるたび。
 * docs/requirements.md 4.8）。**同じ作業ディレクトリで、渡された印を持つもの**のうち最新の1つを
 * 返し、無ければ undefined（新規に起こす）。
 *
 * `includeWorktrees` を切ってあるのは、鍵が「起動した作業ディレクトリ ＋ 印」の2つだから
 * （同じリポジトリの別の worktree は別の作業対象）。
 *
 * **一覧が読めなくても落とさない**（前提不足ではなく動作中の一時的な失敗として扱い、新規に
 * 起こす。docs/coding-standards.md「エラーハンドリング」）。
 */
export async function findSessionToResume(cwd: string, tag: string): Promise<string | undefined> {
  try {
    return selectSessionToResume(await listSessions({ dir: cwd, includeWorktrees: false }), tag)
  } catch {
    return undefined
  }
}

/**
 * 前のセッションの transcript を読み直して、画面の履歴を組み直すためのイベントにする
 * （docs/requirements.md 4.8）。**読めなければ空**（会話（`resume`）だけ生きていれば続行する）。
 *
 * 読んだ内容はそのままイベントの流れに渡すだけで、**どこにも書き出さない**
 * （docs/coding-standards.md「会話内容の扱い」）。
 */
export async function readRestoredEvents(
  sessionId: string,
  cwd: string,
  expressions: readonly ExpressionChoice[],
): Promise<readonly SessionEvent[]> {
  try {
    return toRestoredEvents(
      await getSessionMessages(sessionId, { dir: cwd }),
      toExpressionNames(expressions),
    )
  } catch {
    return []
  }
}

/**
 * 届いたメッセージを内部イベントに変えて流し続ける。**反復を包む `try`/`catch` はここだけ**で、
 * 反復が終わる・落ちるのどちらもセッションの終わりとして扱う。
 */
async function relayMessages(
  session: AsyncIterable<unknown>,
  options: SessionDriverOptions,
): Promise<void> {
  // セッションIDは `session-info`（ターンのたびに届く）から取り、ターンが終わるたびに
  // 印を付け直す（{@link SESSION_TAG_DELAY_MS}）。
  let sessionId: string | undefined = undefined
  try {
    for await (const message of session) {
      for (const event of toSessionEvents(message, toExpressionNames(options.expressions))) {
        if (event.kind === "session-info") {
          sessionId = event.sessionId
        }
        if (event.kind === "turn-finished" && sessionId !== undefined) {
          scheduleMarkSession(sessionId, options)
        }
        options.onEvent(event)
      }
    }
    options.onEvent({ kind: "session-ended", reason: "セッションが終了した" })
  } catch (error) {
    options.onEvent({ kind: "session-ended", reason: describeError(error) })
  }
}

/**
 * ターンの終わりに tsukumo の印を付け直す予約をする（次に起こしたときに自分のセッションを
 * 見分けるため。docs/requirements.md 4.8「鍵」）。本体側の書き込みと重ならないように
 * {@link SESSION_TAG_DELAY_MS} だけ待つ。
 *
 * 待っている間に tsukumo が終わるなら印はどのみち要らないので、タイマーでプロセスを
 * 引き延ばさない（`unref`）。
 */
function scheduleMarkSession(sessionId: string, options: SessionDriverOptions): void {
  setTimeout(() => {
    void markSession(sessionId, options)
  }, SESSION_TAG_DELAY_MS).unref()
}

/**
 * セッションに tsukumo の印を付ける。**失敗しても続行する** — 付かなかったときに起きるのは
 * 「次回は新規から始まる」ことだけで、いま動いているセッションには影響しない
 * （docs/coding-standards.md「エラーハンドリング」）。
 */
async function markSession(sessionId: string, options: SessionDriverOptions): Promise<void> {
  try {
    await tagSession(sessionId, options.tag, { dir: options.cwd })
  } catch {
    // 印が付かないだけなので、何も流さずに諦める。
  }
}

/**
 * グローバルの出力スタイル（`~/.claude/settings.json` の `outputStyle`）をこのセッションの中だけ
 * 中立に戻す。**そうしないと人格が二重に効く**（パックの `persona.md` と、全プロジェクトに効く
 * 出力スタイルが重なる。2026-09-14 実測: 応答が両方の人格を名乗った。docs/requirements.md 4.4）。
 *
 * 触るのは**セッション限りのフラグ層だけ**で、設定ファイルは書き換えない（`updateSettings` の
 * ほうはファイルを書くので使わない）。**失敗しても続行する** — 人格が二重になるだけで、
 * セッション自体は動く（docs/coding-standards.md「エラーハンドリング」）。
 */
async function applyNeutralOutputStyle(session: {
  readonly applyFlagSettings: (settings: { readonly outputStyle: string }) => Promise<void>
}): Promise<void> {
  try {
    await session.applyFlagSettings({ outputStyle: "default" })
  } catch {
    // 中立に戻せなかっただけなので、何も流さずに諦める。
  }
}

/**
 * コマンドの説明を1回だけ取りに行く。`init` の `slash_commands` は名前だけなので、説明は
 * この制御リクエストから受け取る（組み込みコマンドの分も返る。2026-09-12 調査）。
 * 以降セッション中に増減したときは `commands_changed` が押してくる（src/core/sdk-message.ts）。
 *
 * **取れなくてもセッションは続ける**（説明が無いまま名前だけの補完に戻るだけ。
 * docs/coding-standards.md「エラーハンドリング」の「動作中の一時的な失敗」）。
 */
async function relayCommandDescriptions(
  session: { readonly supportedCommands: () => Promise<unknown> },
  options: SessionDriverOptions,
): Promise<void> {
  try {
    const descriptions = toCommandDescriptions(await session.supportedCommands())
    if (descriptions.length > 0) {
      options.onEvent({ kind: "command-descriptions", descriptions })
    }
  } catch {
    // 説明が付かないだけなので、何も流さずに諦める。
  }
}

/**
 * 許可要求と質問を答え待ちの列へ回す。**`canUseTool` の戻り値の型（`PermissionResult`）に
 * 合わせるのはここだけ**で、列の側は SDK を知らない（構造は一致している）。
 */
function askForAnswer(
  queue: PendingAnswerQueue,
  id: string,
  toolName: string,
  input: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<PermissionResult> {
  return queue.ask({ id, toolName, input, signal })
}

/**
 * プロセス内の MCP サーバとして `speak` を提供する。**戻り値は "ok" だけ**にして、
 * tsukumo からモデルへ情報が戻る経路を作らない（docs/architecture.md「セリフはテキストの
 * 規約ではなく、ツール呼び出しで受け取る」）。
 *
 * セリフそのものは、この handler ではなく `assistant` メッセージの変換から取り出す
 * （src/core/sdk-message.ts）。受け取り口を1つにしておくと、イベントの流れが1本で済む。
 */
function speakServer(expressions: readonly ExpressionChoice[]) {
  return createSdkMcpServer({
    name: SPEAK_MCP_SERVER_NAME,
    version: "0.0.0",
    tools: [
      tool(
        SPEAK_TOOL_NAME,
        SPEAK_TOOL_DESCRIPTION,
        {
          text: z.string().describe("セリフ。1〜2文の短い一言"),
          expression: z
            .enum(speakExpressionEnum(expressions))
            .describe(expressionGuide(expressions)),
        },
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      ),
    ],
  })
}

/**
 * zod の `enum` に渡す表情名。**空にならないこと**が型の要求なので、`default` を必ず先頭に置く
 * （`expressionChoices` も `default` を必ず含むが、ここで型としても保証しておく）。
 */
function speakExpressionEnum(
  expressions: readonly ExpressionChoice[],
): [Expression, ...Expression[]] {
  return ["default", ...toExpressionNames(expressions).filter((name) => name !== "default")]
}

/**
 * 表情名とラベルの対応。モデルが名前だけで意味を取れるように説明へ入れる。
 * **ラベルはキャラクターパックの定義から来る**（コードに持たない。docs/design.md 7章）。
 */
function expressionGuide(expressions: readonly ExpressionChoice[]): string {
  const guide = speakExpressionEnum(expressions)
    .map((name) => `${name}（${labelOf(expressions, name)}）`)
    .join(" / ")
  return `表情。${guide}`
}

function labelOf(expressions: readonly ExpressionChoice[], name: Expression): string {
  return expressions.find((choice) => choice.name === name)?.label ?? name
}

/**
 * ストリーミング入力。`query` には「まだ終わらない」非同期イテレータを渡し、依頼が届くたびに
 * user メッセージを1つ流す（docs/requirements.md 4.1「同じ `query` への追加入力」）。
 */
function createPromptStream(): {
  readonly push: (text: string) => void
  readonly end: () => void
  readonly stream: () => AsyncIterable<SDKUserMessage>
} {
  const waiting: string[] = []
  let wake: (() => void) | undefined = undefined
  let closed = false

  const notify = (): void => {
    const resume = wake
    wake = undefined
    resume?.()
  }

  return {
    push: (text) => {
      waiting.push(text)
      notify()
    },
    end: () => {
      closed = true
      notify()
    },
    stream: async function* () {
      while (true) {
        const text = waiting.shift()
        if (text === undefined) {
          if (closed) {
            return
          }
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          continue
        }

        yield {
          type: "user",
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          session_id: "",
        }
      }
    },
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "原因不明"
}
