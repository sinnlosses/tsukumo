import { describe, expect, it } from "vitest"

import {
  NO_VOICE_SLOT,
  voiceSlotOf,
  withoutVoiceRow,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/voice-slot.ts"
import { conversationStreamRows } from "../../../../../../../../src/browser/domain/main-view/conversation-stream.ts"
import type { ShownReaction } from "../../../../../../../../src/shared/session/shown-reaction.ts"
import { splitIntoTurns } from "../../../../../../../../src/shared/session/turn.ts"
import {
  reactionRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../../fixture/session-record.ts"

function shown(reaction: "welcome" | "idle" | "failed" | "retrying" | "limited"): ShownReaction {
  return {
    kind: "shown",
    reaction,
    line: { text: "架空の一言", expression: "default" },
    time: { kind: "restored" },
  }
}

describe("voiceSlotOf", () => {
  it("待ちとおかえり（迎える）だけを定位置の声にする", () => {
    expect(voiceSlotOf(shown("idle")).kind).toBe("voice")
    expect(voiceSlotOf(shown("welcome")).kind).toBe("voice")
  })

  it("再試行・失敗・利用上限と、反応が無いときは定位置を空にする", () => {
    for (const reaction of ["retrying", "failed", "limited"] as const) {
      expect(voiceSlotOf(shown(reaction))).toEqual(NO_VOICE_SLOT)
    }
    expect(voiceSlotOf({ kind: "none" })).toEqual(NO_VOICE_SLOT)
    expect(voiceSlotOf({ kind: "writing" })).toEqual(NO_VOICE_SLOT)
  })
})

describe("withoutVoiceRow", () => {
  const records = [
    requestRecord(),
    speechRecord({ text: "架空の一言" }),
    reactionRecord({ reaction: "idle", text: "架空の一言" }),
    reactionRecord({ reaction: "failed", text: "架空の一言" }),
  ]
  const [first] = splitIntoTurns(records)
  const rows = first === undefined ? [] : conversationStreamRows(first)

  it("定位置が出している反応の記録だけを、流れの行から除く", () => {
    const rest = withoutVoiceRow(rows, voiceSlotOf(shown("idle")))
    expect(rest).toHaveLength(rows.length - 1)
    expect(
      rest.some(
        (row) =>
          row.kind === "say" && row.record.kind === "reaction" && row.record.reaction === "idle",
      ),
    ).toBe(false)
    expect(
      rest.some(
        (row) =>
          row.kind === "say" && row.record.kind === "reaction" && row.record.reaction === "failed",
      ),
    ).toBe(true)
  })

  it("定位置が空なら、記録の位置のまま全部出す", () => {
    expect(withoutVoiceRow(rows, NO_VOICE_SLOT)).toEqual(rows)
  })
})
