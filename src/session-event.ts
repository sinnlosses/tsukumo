// SDK から届いたメッセージを、tsukumo 内部のイベントに変換する。原則2の「受け取る」層。
// 純粋関数で、fs にも process にも触らない。
//
// **SDK の型を import しない。** SDK への依存は src/session-driver.ts の1ファイルに閉じる
// （docs/architecture.md 原則3）。届くメッセージは外部由来の値なので、どのみち構造を信用せず
// unknown で受けて検証する（docs/coding-standards.md「型を迂回するキャストを使わない」）。
// 知らない種別・壊れた形は**空の並び**にして無視する。種別は本体の更新で増える
// （docs/architecture.md「既知の制約・注意点」）。
//
// **会話の内容がここを通る。** 持ち出す先は呼び出し側のビューだけで、ログにもファイルにも
// 書かない（docs/coding-standards.md「会話内容の扱い」）。

import { type Expression } from "./expression.ts"
import { type PendingAsk } from "./pending-answer.ts"

/** プロセス内の MCP サーバの名前。モデルからは `mcp__<サーバ名>__<ツール名>` として見える。 */
export const SPEAK_MCP_SERVER_NAME = "tsukumo"
/** セリフを受け取るツールの名前（docs/glossary.md「speak ツール」）。 */
export const SPEAK_TOOL_NAME = "speak"

/** ターンの終わり方。`result` の subtype が `success` 以外はすべて `error` に倒す。 */
export type TurnStatus = "success" | "error"

/**
 * tsukumo 内部のイベント。SDK のメッセージ由来のものと、駆動側（src/session-driver.ts）が
 * 自分で起こすもの（`request` / `pending-changed` / `session-ended`）が1本の流れに混ざる。
 * 受け取る側（src/session-view.ts）はどちらから来たかを区別しない。
 */
export type SessionEvent =
  /**
   * `system` の `init`。**プロンプトを送るたびに届く**ので「新しいセッション」の合図にしない
   * （2026-09-11 実測。docs/requirements.md 4.1）。`slash_commands` は毎回上書きでよい。
   */
  | {
      readonly kind: "session-info"
      readonly sessionId: string
      readonly model: string | undefined
      readonly permissionMode: string | undefined
      readonly slashCommands: readonly string[]
    }
  /** 利用者が送った依頼。ターンの境目になる（駆動側が送信時に起こす）。 */
  | { readonly kind: "request"; readonly text: string }
  /** 書きかけのターンの本文。完成した本文が来るまでの**仮**（docs/requirements.md 4.2）。 */
  | { readonly kind: "partial-utterance"; readonly text: string }
  /** 完成したターンの本文。仮の本文を置き換える。 */
  | { readonly kind: "utterance"; readonly text: string }
  /** `speak` ツールの呼び出し。セリフと表情（docs/glossary.md「セリフ」「表情」）。 */
  | { readonly kind: "speech"; readonly text: string; readonly expression: Expression }
  | {
      readonly kind: "tool-started"
      readonly toolUseId: string
      readonly name: string
      readonly input: unknown
    }
  | {
      readonly kind: "tool-finished"
      readonly toolUseId: string
      readonly content: string
      readonly isError: boolean
    }
  /** 答え待ちの列が変わった（積まれた・解決した）。中身は src/pending-answer.ts が持つ。 */
  | { readonly kind: "pending-changed"; readonly pending: readonly PendingAsk[] }
  | { readonly kind: "turn-finished"; readonly status: TurnStatus }
  /** `query()` の反復が終わった（正常終了・例外のどちらも）。プロセスは落とさない。 */
  | { readonly kind: "session-ended"; readonly reason: string }

/**
 * SDK のメッセージ1つを内部イベントの並びに変換する。1つのメッセージから複数のイベントが
 * 出ることがある（`assistant` の `content[]` にテキストとツール呼び出しが並ぶため）。
 *
 * - **`thinking` は変換しない。** モデルの内部の思考なので内部の型にも入れない
 *   （docs/requirements.md 4.1）
 * - **`speak` の呼び出しは `tool-started` にしない。** `speech` として別に出す（吹き出し行き）
 * - `expression` は `expressions`（キャラクター定義にある表情名）に無ければ `default` に落とす
 *   （docs/architecture.md 原則4 — 表情名をコードに書かない）
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
      return message.subtype === "init" ? sessionInfoEvents(message) : []
    case "stream_event":
      return partialUtteranceEvents(message.event)
    case "assistant":
      return assistantEvents(message.message, expressions)
    case "user":
      return toolResultEvents(message.message)
    case "result":
      return [{ kind: "turn-finished", status: turnStatus(message.subtype) }]
    default:
      return []
  }
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

function assistantEvents(
  message: unknown,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return []
  }

  return message.content.flatMap((block) => assistantBlockEvents(block, expressions))
}

function assistantBlockEvents(
  block: unknown,
  expressions: readonly Expression[],
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
    ? [{ kind: "tool-started", toolUseId: block.id, name: block.name, input: block.input }]
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
