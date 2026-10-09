import { describe, expect, it } from "vitest"

import {
  turnSpanLabel,
  turnSpans,
  type TurnSpan,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/turn-span.ts"
import {
  finishedToolStatus,
  reportRecord,
  requestRecord,
  speechRecord,
  toolRecord,
} from "../../../../../../../fixture/session-record.ts"

// フィクスチャはすべて手で書いた架空の記録（実物の会話は使わない）。

const STARTED_AT = Temporal.Instant.from("2026-01-02T19:10:00Z").epochMilliseconds

function at(offsetSeconds: number): { readonly kind: "stamped"; readonly at: number } {
  return { kind: "stamped", at: STARTED_AT + offsetSeconds * 1000 }
}

function labelOf(span: TurnSpan | undefined): string {
  return span === undefined ? "（無い）" : turnSpanLabel(span, "UTC")
}

describe("turnSpans", () => {
  it("依頼だけのやり取りは、開始の時刻だけを出す", () => {
    const spans = turnSpans([requestRecord({ turnId: 3, time: at(0) })])

    expect(spans.get(3)).toEqual({ kind: "started", startedAt: STARTED_AT })
    expect(labelOf(spans.get(3))).toBe("19:10")
  })

  it("終わりは、依頼より後の記録のうちいちばん遅い時刻（終わったツールの時刻も数える）", () => {
    const spans = turnSpans([
      requestRecord({ turnId: 0, time: at(0) }),
      speechRecord({ time: at(30) }),
      toolRecord({ startedAt: at(40), status: finishedToolStatus({ finishedAt: at(400) }) }),
      reportRecord(),
      requestRecord({ turnId: 1, time: at(500) }),
    ])

    expect(spans.get(0)).toEqual({
      kind: "spanned",
      startedAt: STARTED_AT,
      endedAt: STARTED_AT + 400_000,
    })
    expect(spans.get(1)).toEqual({ kind: "started", startedAt: STARTED_AT + 500_000 })
  })

  it("時刻の分からない記録（restored）は数えず、依頼の時刻が分からなければ開始も出さない", () => {
    const spans = turnSpans([
      requestRecord({ turnId: 0, time: at(0) }),
      speechRecord({ time: at(20) }),
      speechRecord({ time: { kind: "restored" } }),
      requestRecord({ turnId: 1, time: { kind: "restored" } }),
      speechRecord({ time: at(900) }),
    ])

    expect(labelOf(spans.get(0))).toBe("19:10　20秒")
    expect(labelOf(spans.get(1))).toBe("")
  })

  it("依頼より前の記録は時刻を持っていても開始を出さない", () => {
    const spans = turnSpans([speechRecord({ time: at(0) }), requestRecord({ turnId: 0 })])

    expect(labelOf(spans.get(-1))).toBe("")
  })
})

describe("turnSpanLabel の所要", () => {
  it.each([
    [59, "59秒"],
    [60, "1分"],
    [3599, "59分"],
    [3600, "1時間0分"],
    [3600 + 23 * 60 + 5, "1時間23分"],
  ])("%i 秒は「%s」", (seconds, expected) => {
    const span: TurnSpan = {
      kind: "spanned",
      startedAt: STARTED_AT,
      endedAt: STARTED_AT + seconds * 1000,
    }

    expect(turnSpanLabel(span, "UTC")).toBe(`19:10　${expected}`)
  })
})
