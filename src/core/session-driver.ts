// セッション駆動。Agent SDK で Claude Code を子プロセスとして起こし、届いたメッセージを
// 内部イベントに変えて流す（docs/glossary.md「セッション駆動」）。
//
// **`@anthropic-ai/claude-agent-sdk` を import するのはこのファイルだけ**（原則3。`orca` を
// 呼ぶのが src/core/orca-host.ts だけなのと同じ扱い）。SDK の語彙を外へ漏らさないため、外に出す型は
// このファイルで定義し直すか protocol から取る。
//
// **セッションは1プロセスに1つで、毎回新規**（再開はしない。docs/requirements.md 2.2）。
//
// 会話の内容（本文・ツールの入出力・セリフ）がここを通るが、**ログにもファイルにも書かない**
// （docs/coding-standards.md「会話内容の扱い」）。stderr に出すのは SDK 自身のエラー文だけ。

import {
  createSdkMcpServer,
  type EffortLevel,
  type PermissionResult,
  query,
  type SDKUserMessage,
  tool,
} from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { type ModelAlias, type PermissionMode } from "../protocol/command.ts"
import { type Expression, expressionLabel } from "../protocol/expression.ts"
import { type Answer, type PendingAsk } from "../protocol/pending-ask.ts"
import { type SessionEvent } from "../protocol/session-event.ts"
import { createPendingAnswerQueue, type PendingAnswerQueue } from "./pending-answer.ts"
import {
  SPEAK_MCP_SERVER_NAME,
  SPEAK_TOOL_NAME,
  toCommandDescriptions,
  toSessionEvents,
} from "./sdk-message.ts"

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
 * （`src/presentation/view.ts` の `MODEL_FALLBACK`）も同じ値に揃える。
 */
export const DEFAULT_MODEL: ModelAlias = "opus"

/**
 * 既定の reasoning effort。ユーザーの指示（2026-09-12）で high に固定した
 * （docs/requirements.md 4.1）。画面には出さない（設定するだけ）。
 */
export const DEFAULT_EFFORT: EffortLevel = "high"

/** モデルに見せる `speak` ツールの説明。**セリフと本文の境目はここだけで説明する。** */
const SPEAK_TOOL_DESCRIPTION =
  "キャラクターがユーザーに向けて話す。掛け声・呼びかけ・リアクション・感想・完了報告はこのツールで言う。" +
  "手順・コード・表・判断とその理由は本文に書き、ここには入れない。"

export type SessionDriverOptions = {
  /** セッションの作業ディレクトリ。 */
  readonly cwd: string
  /** `speak` の `expression` で受け付ける表情名（キャラクター定義から作る）。 */
  readonly expressions: readonly Expression[]
  readonly permissionMode: PermissionMode
  /**
   * `systemPrompt` に足す文字列（レポートの記法など）。**中身を core が決めない**
   * （描く側の都合なので、配線（src/index.ts）が渡す。段6でここに人格 = persona も乗る。
   * docs/design.md 5章）。
   */
  readonly systemPromptAppend: string
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
  }
}

/**
 * 届いたメッセージを内部イベントに変えて流し続ける。**ここが唯一の `try`/`catch`**で、
 * 反復が終わる・落ちるのどちらもセッションの終わりとして扱う。
 */
async function relayMessages(
  session: AsyncIterable<unknown>,
  options: SessionDriverOptions,
): Promise<void> {
  try {
    for await (const message of session) {
      for (const event of toSessionEvents(message, options.expressions)) {
        options.onEvent(event)
      }
    }
    options.onEvent({ kind: "session-ended", reason: "セッションが終了した" })
  } catch (error) {
    options.onEvent({ kind: "session-ended", reason: describeError(error) })
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
function speakServer(expressions: readonly Expression[]) {
  return createSdkMcpServer({
    name: SPEAK_MCP_SERVER_NAME,
    version: "0.0.0",
    tools: [
      tool(
        SPEAK_TOOL_NAME,
        SPEAK_TOOL_DESCRIPTION,
        {
          text: z.string().describe("セリフ。1〜2文の短い一言"),
          expression: z.enum(expressionNames(expressions)).describe(expressionGuide(expressions)),
        },
        async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      ),
    ],
  })
}

/**
 * zod の `enum` に渡す表情名。**空にならないこと**が型の要求なので、`default` を必ず先頭に置く
 * （`availableExpressions` も `default` を必ず含むが、ここで型としても保証しておく）。
 */
function expressionNames(expressions: readonly Expression[]): [Expression, ...Expression[]] {
  return ["default", ...expressions.filter((expression) => expression !== "default")]
}

/** 表情名と日本語ラベルの対応。モデルが名前だけで意味を取れるように説明へ入れる。 */
function expressionGuide(expressions: readonly Expression[]): string {
  const guide = expressionNames(expressions)
    .map((expression) => `${expression}（${expressionLabel(expression)}）`)
    .join(" / ")
  return `表情。${guide}`
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
