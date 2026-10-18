// `user` メッセージに乗るツールの結果を、tsukumo 内部の `tool-finished` イベントに変換する。
// 結果は外部由来の値なので、unknown で受けて検証する。
//
// 会話の内容がここを通る。
// 持ち出す先は呼び出し側のイベントの流れだけで、ログにもファイルにも書かない。

import { isPlainObject } from "remeda"

import type { SessionEvent } from "../../../shared/session/session-event.ts"

export function toolResultEvents(message: unknown): readonly SessionEvent[] {
  if (!isPlainObject(message) || !Array.isArray(message.content)) {
    return []
  }

  return message.content.flatMap((block) => toolResultBlockEvents(block))
}

function toolResultBlockEvents(block: unknown): readonly SessionEvent[] {
  if (
    !isPlainObject(block) ||
    block.type !== "tool_result" ||
    typeof block.tool_use_id !== "string"
  ) {
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
  if (!isPlainObject(item)) {
    return ""
  }
  if (item.type === "text" && typeof item.text === "string") {
    return item.text
  }

  return typeof item.type === "string" ? `(${item.type})` : ""
}
