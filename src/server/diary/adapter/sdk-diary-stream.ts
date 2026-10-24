// 日記の問い合わせの `includePartialMessages` の断片を、3段の合図（`diary-drafting` / `diary-stage`）へ変える観測。

import { isPlainObject } from "remeda"

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { tsukumoToolFullName } from "../../session-driver/core/tsukumo-tool-name.ts"
import { DIARY_TOOL_NAME, diaryArgumentHasBookmarkKey } from "../core/diary-tool.ts"

const DIARY_TOOL_FULL_NAME = tsukumoToolFullName(DIARY_TOOL_NAME)

/** {@link createDiaryStreamObserver} が返す窓口。 */
export type DiaryStreamObserver = {
  /**
   * 生のメッセージ1件を渡す。
   * `diary` ツールの塊が開いたら `diary-drafting` を、引数の断片をつないで `bookmark` の鍵を見つけたら `diary-stage { stage: "pick" }` を返す（同じ塊では `pick` を二度と返さない）。
   * 塊が閉じたら追いかけるのをやめる。それ以外は常に空の並び。
   */
  readonly observe: (message: unknown) => readonly SessionEvent[]
}

/**
 * {@link DiaryStreamObserver} を1つ作る（問い合わせ1回に1つ）。
 * `index` で塊を見分け、サブエージェントの中（`parent_tool_use_id` あり）は見ない。
 * `stream_event` の生の形は `isPlainObject` で構造だけを見る。
 */
export function createDiaryStreamObserver(): DiaryStreamObserver {
  let tracking: { readonly index: number; readonly buffer: string } | undefined

  return {
    observe: (message) => {
      if (
        !isPlainObject(message) ||
        message.type !== "stream_event" ||
        typeof message.parent_tool_use_id === "string" ||
        !isPlainObject(message.event)
      ) {
        return []
      }
      const event = message.event
      const index = event.index
      if (typeof index !== "number") {
        return []
      }

      if (event.type === "content_block_start" && isPlainObject(event.content_block)) {
        const block = event.content_block
        if (block.type === "tool_use" && block.name === DIARY_TOOL_FULL_NAME) {
          tracking = { index, buffer: "" }
          return [
            { kind: "diary-drafting", toolUseId: typeof block.id === "string" ? block.id : "" },
          ]
        }
        tracking = undefined
        return []
      }

      if (tracking === undefined || tracking.index !== index) {
        return []
      }

      if (event.type === "content_block_delta" && isPlainObject(event.delta)) {
        if (
          event.delta.type !== "input_json_delta" ||
          typeof event.delta.partial_json !== "string"
        ) {
          return []
        }
        const buffer = tracking.buffer + event.delta.partial_json
        tracking = { index, buffer }
        if (diaryArgumentHasBookmarkKey(buffer)) {
          // 拾ったら、この塊が閉じるまで待たずに追いかけるのをやめる（二重に出さない）。
          tracking = undefined
          return [{ kind: "diary-stage", stage: "pick" }]
        }
        return []
      }

      if (event.type === "content_block_stop") {
        tracking = undefined
      }
      return []
    },
  }
}
