// `includePartialMessages` で流れる断片（`stream_event`）を、tsukumo 内部のイベントに変換する。
// 断片の中身は外部由来の値なので、unknown で受けて検証する。
//
// 会話の内容がここを通る。
// 持ち出す先は呼び出し側のイベントの流れだけで、ログにもファイルにも書かない。

import { isPlainObject } from "remeda"

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { REPORT_TOOL_NAME, tsukumoToolFullName } from "./tsukumo-tool-name.ts"

/**
 * `includePartialMessages` で流れる断片から、本文のテキストだけを拾う。
 * 本文以外のイベント（`content_block_start` / `message_delta` など）は無視する。
 * メインの断片だけ（サブエージェントの本文は拾わない）。
 */
export function partialUtteranceEvents(
  event: unknown,
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (
    parentToolUseId !== undefined ||
    !isPlainObject(event) ||
    event.type !== "content_block_delta" ||
    !isPlainObject(event.delta)
  ) {
    return []
  }

  const delta = event.delta
  if (delta.type !== "text_delta" || typeof delta.text !== "string" || delta.text === "") {
    return []
  }

  return [{ kind: "partial-utterance", text: delta.text }]
}

/**
 * `includePartialMessages` の断片のうち、メインの `report` の呼び出しの塊が開いた合図
 * （`content_block_start` の `tool_use`）だけを `report-drafting` にする。
 */
export function reportDraftingEvents(
  event: unknown,
  parentToolUseId: string | undefined,
): readonly SessionEvent[] {
  if (
    parentToolUseId !== undefined ||
    !isPlainObject(event) ||
    event.type !== "content_block_start" ||
    !isPlainObject(event.content_block)
  ) {
    return []
  }

  const block = event.content_block
  return block.type === "tool_use" &&
    block.name === tsukumoToolFullName(REPORT_TOOL_NAME) &&
    typeof block.id === "string"
    ? [{ kind: "report-drafting", toolUseId: block.id }]
    : []
}
