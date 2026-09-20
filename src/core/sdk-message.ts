// SDK から届いたメッセージを、tsukumo 内部のイベント（src/shared/session-event.ts）に変換する。
//
// **SDK の型を import しない。** SDK への依存は src/adapter/sdk-driver.ts の1ファイルに閉じる
// （docs/design.md 5章）。届くメッセージは外部由来の値なので、どのみち構造を信用せず
// unknown で受けて検証する（docs/coding-standards.md「型を迂回するキャストを使わない」）。
// 知らない種別・壊れた形は**空の並び**にして無視する。種別は本体の更新で増える
// （docs/architecture.md「既知の制約・注意点」）。
//
// **会話の内容がここを通る。** 持ち出す先は呼び出し側のイベントの流れだけで、ログにもファイルにも
// 書かない（docs/coding-standards.md「会話内容の扱い」）。

import { type Expression } from "../shared/expression.ts"
import {
  type CommandDescription,
  type SessionEvent,
  type TurnStatus,
} from "../shared/session-event.ts"

/** プロセス内の MCP サーバの名前。モデルからは `mcp__<サーバ名>__<ツール名>` として見える。 */
export const SPEAK_MCP_SERVER_NAME = "tsukumo"
/** セリフを受け取るツールの名前（docs/glossary.md「speak ツール」）。 */
export const SPEAK_TOOL_NAME = "speak"

/**
 * SDK のメッセージ1つを内部イベントの並びに変換する。1つのメッセージから複数のイベントが
 * 出ることがある（`assistant` の `content[]` にテキストとツール呼び出しが並ぶため）。
 *
 * - **`thinking` は変換しない。** モデルの内部の思考なので内部の型にも入れない
 *   （docs/requirements.md 4.1）
 * - **`speak` の呼び出しは `tool-started` にしない。** `speech` として別に出す（吹き出し行き）
 * - `expression` は `expressions`（キャラクター定義にある表情名）に無ければ `default` に落とす
 *   （docs/architecture.md 原則4 — 表情名をコードに書かない）
 * - **`tool-started` の `parentToolUseId`** は、メッセージ本体（`message.message` の外）にある
 *   `parent_tool_use_id` から取る（サブエージェントの中で動いたツールだけ非 null。2026-09-11 実測）。
 *   同じ assistant メッセージに含まれる `tool_use` はすべて同じ値を持つ
 * - **`conversation_reset` は `/clear` の合図**（2026-09-15 実測）。tsukumo は `/clear` という
 *   文字列を見ず、本体が会話を捨てたことをこのメッセージで知る
 * - **`assistant` に乗る `local_command_run` が `{ command: "model", args }` の形のときだけ
 *   `model-changed` を出す**（2026-09-17 実測）。`command` が `model` 以外の局所コマンド
 *   （`/clear` など）や、形が崩れている・`args` が無いときは出さない。エイリアスとして
 *   知っているかどうかの検証はここでしない（docs/design.md 4.1、session-state.ts の仕事）
 * - 知らない `type`・壊れた形は空の並びを返す（落ちない）
 */
export function toSessionEvents(
  message: unknown,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  if (!isRecord(message) || typeof message.type !== "string") {
    return []
  }

  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        return sessionInfoEvents(message)
      }
      return message.subtype === "commands_changed"
        ? [{ kind: "command-descriptions", descriptions: toCommandDescriptions(message.commands) }]
        : []
    case "stream_event":
      return partialUtteranceEvents(message.event)
    case "assistant":
      return [
        ...assistantEvents(
          message.message,
          expressions,
          optionalString(message.parent_tool_use_id),
        ),
        ...modelChangeEvents(message.local_command_run),
      ]
    case "user":
      return toolResultEvents(message.message)
    case "result":
      return [{ kind: "turn-finished", status: turnStatus(message.subtype) }]
    case "conversation_reset":
      // `/clear` で本体が会話を捨てたとき（2026-09-15 実測）。**`/compact` では届かない。**
      return [{ kind: "conversation-cleared" }]
    default:
      return []
  }
}

/**
 * SDK が返すコマンド一覧（`supportedCommands()` の戻り値と `commands_changed` の `commands`）を
 * 検証して内部の型に変える。**駆動側（src/adapter/sdk-driver.ts）が制御リクエストの結果に対しても
 * これを使う**ので、`toSessionEvents` とは別に公開してある（検証の場所を1つにするため）。
 * 名前が文字列でない要素は捨て、説明が空文字のものは `undefined` にする。
 */
export function toCommandDescriptions(value: unknown): readonly CommandDescription[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== "string" || item.name === "") {
      return []
    }
    const description = optionalString(item.description)
    return [{ name: item.name, description: description === "" ? undefined : description }]
  })
}

function sessionInfoEvents(message: Readonly<Record<string, unknown>>): readonly SessionEvent[] {
  if (typeof message.session_id !== "string") {
    return []
  }

  return [
    {
      kind: "session-info",
      sessionId: message.session_id,
      model: optionalString(message.model),
      permissionMode: optionalString(message.permissionMode),
      slashCommands: stringArray(message.slash_commands),
      terminalSlashCommands: stringArray(message.terminal_slash_commands),
    },
  ]
}

/**
 * `includePartialMessages` で流れる断片から、本文のテキストだけを拾う。
 * 本文以外のイベント（`content_block_start` / `message_delta` など）は無視する。
 */
function partialUtteranceEvents(event: unknown): readonly SessionEvent[] {
  if (!isRecord(event) || event.type !== "content_block_delta" || !isRecord(event.delta)) {
    return []
  }

  const delta = event.delta
  if (delta.type !== "text_delta" || typeof delta.text !== "string" || delta.text === "") {
    return []
  }

  return [{ kind: "partial-utterance", text: delta.text }]
}

/**
 * `assistant` に乗る `local_command_run` から `/model` の合図を取り出す。**`command` が
 * `model` 以外の局所コマンド（`/clear` など）では何も出さない。** `args` が文字列でない・
 * 無い・空（引数なしの `/model` はモデルの選択を出すだけで切り替えない）ときも同様
 * （2026-09-17 実測。docs/design.md 4.1）。
 */
function modelChangeEvents(localCommandRun: unknown): readonly SessionEvent[] {
  if (!isRecord(localCommandRun) || localCommandRun.command !== "model") {
    return []
  }

  const args = optionalString(localCommandRun.args)?.trim()
  return args === undefined || args === "" ? [] : [{ kind: "model-changed", model: args }]
}

function assistantEvents(
  message: unknown,
  expressions: readonly Expression[],
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return []
  }

  return message.content.flatMap((block) =>
    assistantBlockEvents(block, expressions, parentToolUseId),
  )
}

function assistantBlockEvents(
  block: unknown,
  expressions: readonly Expression[],
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (!isRecord(block)) {
    return []
  }

  if (block.type === "text") {
    return typeof block.text === "string" && block.text.trim() !== ""
      ? [{ kind: "utterance", text: block.text }]
      : []
  }

  if (block.type !== "tool_use" || typeof block.name !== "string") {
    return []
  }

  if (block.name === speakToolFullName()) {
    return speechEvents(block.input, expressions)
  }

  return typeof block.id === "string"
    ? [
        {
          kind: "tool-started",
          toolUseId: block.id,
          name: block.name,
          input: block.input,
          parentToolUseId,
        },
      ]
    : []
}

function speechEvents(input: unknown, expressions: readonly Expression[]): readonly SessionEvent[] {
  if (!isRecord(input) || typeof input.text !== "string") {
    return []
  }

  return [
    { kind: "speech", text: input.text, expression: toExpression(input.expression, expressions) },
  ]
}

/** モデルから見えるツールのフルネーム。MCP サーバ名とツール名から決まる（2026-09-11 実測）。 */
function speakToolFullName(): string {
  return `mcp__${SPEAK_MCP_SERVER_NAME}__${SPEAK_TOOL_NAME}`
}

function toExpression(value: unknown, expressions: readonly Expression[]): Expression {
  if (typeof value !== "string") {
    return "default"
  }

  return expressions.find((expression) => expression === value) ?? "default"
}

function toolResultEvents(message: unknown): readonly SessionEvent[] {
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return []
  }

  return message.content.flatMap((block) => toolResultBlockEvents(block))
}

function toolResultBlockEvents(block: unknown): readonly SessionEvent[] {
  if (!isRecord(block) || block.type !== "tool_result" || typeof block.tool_use_id !== "string") {
    return []
  }

  return [
    {
      kind: "tool-finished",
      toolUseId: block.tool_use_id,
      content: toolResultContentText(block.content),
      isError: block.is_error === true,
    },
  ]
}

/**
 * `tool_result` の `content` は文字列のことが多いが、複数ブロックの配列のこともある。
 * テキストのブロックだけをつなぎ、テキスト以外（画像など）は中身を持ち出さず種別のラベルだけ残す。
 */
function toolResultContentText(content: unknown): string {
  if (typeof content === "string") {
    return content
  }
  if (!Array.isArray(content)) {
    return ""
  }

  return content.map((item) => toolResultContentItemText(item)).join("\n\n")
}

function toolResultContentItemText(item: unknown): string {
  if (!isRecord(item)) {
    return ""
  }
  if (item.type === "text" && typeof item.text === "string") {
    return item.text
  }

  return typeof item.type === "string" ? `(${item.type})` : ""
}

/**
 * `result` の subtype を終わり方に倒す。中断されたターンは `error_during_execution` で終わる
 * （2026-09-11 実測）ので、成功以外はまとめて `error` にする。
 */
function turnStatus(subtype: unknown): TurnStatus {
  return subtype === "success" ? "success" : "error"
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
