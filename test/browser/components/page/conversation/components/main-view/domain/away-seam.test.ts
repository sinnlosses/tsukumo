import { describe, expect, it } from "vitest"

import { awaySeamOf } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/away-seam.ts"
import { streamItemsOf } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/stream-item-list.ts"
import {
  awayLongEnough,
  type Away,
} from "../../../../../../../../src/browser/components/page/conversation/domain/away-seam.ts"
import { conversationStreamRows } from "../../../../../../../../src/browser/domain/main-view/conversation-stream.ts"
import type { SessionRecord } from "../../../../../../../../src/shared/session/session-record.ts"
import { splitIntoTurns } from "../../../../../../../../src/shared/session/turn.ts"
import {
  requestRecord,
  speechRecord,
  workPlanRecord,
} from "../../../../../../../fixture/session-record.ts"
import { turn } from "../../../../../../../fixture/turn.ts"

const MINUTE = 60_000

function seamFor(records: readonly SessionRecord[], away: Partial<Away>) {
  const [first] = splitIntoTurns(records)
  if (first === undefined) {
    throw new Error("やり取りが無い")
  }
  const rows = conversationStreamRows(first)
  const items = streamItemsOf(rows, turn([]))
  return awaySeamOf({
    away: { generation: 1, turnId: 0, rowCount: 2, awayMs: 4 * MINUTE, ...away },
    rows,
    items,
  })
}

describe("awaySeamOf", () => {
  const records = [
    requestRecord(),
    speechRecord({ text: "見た行" }),
    speechRecord({ text: "新しい行" }),
    speechRecord({ text: "もう1行" }),
  ]

  it("前に見た位置より後ろの最初の行の手前に線を置く", () => {
    expect(seamFor(records, {})).toEqual({ kind: "seam", before: 2, label: "離れていた 4分" })
  })

  it("新しい行が無ければ出さない", () => {
    expect(seamFor(records, { rowCount: 4 })).toEqual({ kind: "none" })
  })

  it("1分未満は時間を添えない", () => {
    expect(seamFor(records, { awayMs: 45_000 })).toEqual({ kind: "seam", before: 2, label: "" })
  })

  it("済んだフェーズの札の数を文に添える", () => {
    const withPlans = [...records, workPlanRecord(), workPlanRecord()]
    expect(seamFor(withPlans, {})).toMatchObject({
      label: "離れていた 4分のあいだに、フェーズが2つ済んだ",
    })
    expect(seamFor(withPlans, { awayMs: 45_000 })).toMatchObject({ label: "フェーズが2つ済んだ" })
  })
})

describe("awayLongEnough", () => {
  it("30秒未満は線を出さない", () => {
    expect(awayLongEnough(29_999)).toBe(false)
    expect(awayLongEnough(30_000)).toBe(true)
  })
})
