// 声の定位置。流れの外（紙の後ろ）に届く声を、入力欄のすぐ上に1件だけ出すための決まり。

import type { RecordTime } from "../../../../../../../shared/session/session-record.ts"
import type { ShownReaction } from "../../../../../../../shared/session/shown-reaction.ts"
import type { ConversationStreamRow } from "../../../../../../domain/main-view/conversation-stream.ts"

/** 定位置に出す声。 */
export type VoiceSlot =
  | { readonly kind: "none" }
  /** 声を書いている途中。迎える場面の定位置が「…」を出す。 */
  | { readonly kind: "writing" }
  | {
      readonly kind: "voice"
      readonly reaction: "welcome"
      readonly text: string
      readonly time: RecordTime
    }

export const NO_VOICE_SLOT = { kind: "none" } as const satisfies VoiceSlot

const WRITING_VOICE_SLOT = { kind: "writing" } as const satisfies VoiceSlot

export function voiceSlotOf(reaction: ShownReaction): VoiceSlot {
  if (reaction.kind === "writing") {
    return WRITING_VOICE_SLOT
  }
  if (reaction.kind !== "shown") {
    return NO_VOICE_SLOT
  }
  // 待ちの一言は流れの行のまま、記録の位置に出す。
  if (reaction.reaction !== "welcome") {
    return NO_VOICE_SLOT
  }
  return {
    kind: "voice",
    reaction: reaction.reaction,
    text: reaction.line.text,
    time: reaction.time,
  }
}

/** 定位置が出している声と同じ記録（同じ出来事・同じ文のうち最後の1件）を、流れの行から除く。 */
export function withoutVoiceRow(
  rows: readonly ConversationStreamRow[],
  voice: VoiceSlot,
): readonly ConversationStreamRow[] {
  if (voice.kind !== "voice") {
    return rows
  }
  const placed = rows.findLastIndex(
    (row) =>
      row.kind === "say" &&
      row.record.kind === "reaction" &&
      row.record.reaction === voice.reaction &&
      row.record.text === voice.text,
  )
  return placed < 0 ? rows : rows.filter((_row, index) => index !== placed)
}
