import { describe, expect, it } from "vitest"

import { pointedBoxIdsBetween } from "../../../../../../src/browser/components/page/conversation/domain/map-pointing.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../src/shared/session/session-state.ts"
import { reportRecord, speechRecord } from "../../../../../fixture/session-record.ts"

function withRecords(...records: SessionState["records"]): SessionState {
  return { ...INITIAL_SESSION_STATE, records }
}

describe("pointedBoxIdsBetween", () => {
  it("新しいセリフと結論の印を届いた順に拾う", () => {
    const next = withRecords(
      speechRecord({ text: "見て {{map: server/report}} を" }),
      reportRecord("結論 {{map: browser/features/report}} と {{map: app}}"),
    )

    expect(pointedBoxIdsBetween(INITIAL_SESSION_STATE, next)).toEqual([
      "server/report",
      "browser/features/report",
      "app",
    ])
  })

  it("入れ子の部品の文字列の深い所からも拾う", () => {
    const next = withRecords(
      reportRecord("架空の結論", {
        components: [
          {
            id: "t1",
            component: "Table",
            title: "架空の表",
            columns: ["列"],
            rows: [["a", "{{map: deep/box}}"]],
            rest: "",
            fold: "",
            aside: "",
          },
        ],
      }),
    )

    expect(pointedBoxIdsBetween(INITIAL_SESSION_STATE, next)).toEqual(["deep/box"])
  })

  it("前に積まれていた記録と、inline code の中の印は拾わない", () => {
    const old = speechRecord({ text: "{{map: old/box}}" })
    const previous = withRecords(old)
    const next = withRecords(old, speechRecord({ text: "`{{map: in/code}}` と {{map: fresh}}" }))

    expect(pointedBoxIdsBetween(previous, next)).toEqual(["fresh"])
  })

  it("map でない印と壊れた印は拾わない", () => {
    const next = withRecords(speechRecord({ text: "{{3 / 5}} {{map: a b}} {{map:" }))

    expect(pointedBoxIdsBetween(INITIAL_SESSION_STATE, next)).toEqual([])
  })

  it("記録が縮んだときは空", () => {
    const previous = withRecords(speechRecord({ text: "{{map: a}}" }), speechRecord())

    expect(
      pointedBoxIdsBetween(previous, withRecords(speechRecord({ text: "{{map: b}}" }))),
    ).toEqual([])
  })
})
