import { describe, expect, it } from "vitest"

import {
  talkFlowOf,
  type TalkFlowRow,
} from "../../../../../../../../src/browser/components/page/conversation/components/character-view/domain/talk-flow.ts"
import type {
  RecordTime,
  SessionRecord,
} from "../../../../../../../../src/shared/session/session-record.ts"
import { turnSpeeches } from "../../../../../../../../src/shared/session/turn-speech.ts"
import {
  asideRecord,
  requestRecord,
  speechRecord,
  workPlanRecord,
} from "../../../../../../../fixture/session-record.ts"

const PHASES = ["架空の調べ", "架空の実装", "架空の受け入れ"]

function plan(current: number, phaseSummary: string): SessionRecord {
  return workPlanRecord({ phases: PHASES, current, phaseSummary })
}

function chip(text: string, time: RecordTime): SessionRecord {
  return { kind: "aizuchi-chip", text, time }
}

function at(minutes: number): RecordTime {
  return { kind: "stamped", at: minutes * 60_000 }
}

/** 行を「誰・時刻・文・終えた段」に畳む。 */
function rowsOf(records: readonly SessionRecord[]): readonly (readonly unknown[])[] {
  return talkFlowOf(records, "UTC", "きみ").map((row: TalkFlowRow) => [
    row.kind,
    row.time.kind === "known" ? row.time.text : "",
    row.text,
    ...(row.kind === "her" && row.finishedStep.kind === "finished"
      ? [row.finishedStep.stepId]
      : []),
  ])
}

describe("talkFlowOf（舞台に流すやり取りの並び）", () => {
  it("依頼の行は添えた画像を持ち、補足の行は持たない", () => {
    const images = [{ kind: "sent", id: "a", thumbnail: "data:image/png;base64,AAAA" }] as const
    const rows = talkFlowOf(
      [
        requestRecord({ text: "架空の依頼", images, time: at(1) }),
        asideRecord({ text: "架空の補足", time: at(2) }),
      ],
      "UTC",
    )

    expect(rows.map((row) => (row.kind === "you" ? row.images : "her"))).toEqual([
      images,
      undefined,
    ])
  })

  it("依頼・セリフ・補足・セリフを、時刻の順に you/her/you/her で並べる", () => {
    expect(
      rowsOf([
        requestRecord({ text: "架空の依頼", time: at(1) }),
        speechRecord({ text: "架空の返事", time: at(2) }),
        asideRecord({ text: "架空の補足", time: at(3) }),
        speechRecord({ text: "架空の答え", time: at(4), answersAside: true }),
      ]),
    ).toEqual([
      ["you", "00:01", "架空の依頼"],
      ["her", "00:02", "架空の返事"],
      ["you", "00:03", "架空の補足"],
      ["her", "00:04", "架空の答え"],
    ])
  })

  it("セリフの直後に段を終えたワークプランが来たら、そのセリフに紙の段が付く", () => {
    expect(
      rowsOf([
        requestRecord({ time: at(1) }),
        plan(0, ""),
        speechRecord({ text: "架空の着手", time: at(2) }),
        speechRecord({ text: "架空の区切り", time: at(3) }),
        plan(1, "架空のまとめ"),
      ]),
    ).toEqual([
      ["you", "00:01", "架空の依頼"],
      ["her", "00:02", "架空の着手"],
      ["her", "00:03", "架空の区切り", 0],
    ])
  })

  it("段を終えたワークプランのあとにセリフが来ても、そのセリフに付く", () => {
    expect(
      rowsOf([
        requestRecord({ time: at(1) }),
        speechRecord({ text: "架空の着手", time: at(2) }),
        plan(0, ""),
        plan(1, "架空のまとめ"),
        speechRecord({ text: "架空の区切り", time: at(3) }),
      ]),
    ).toEqual([
      ["you", "00:01", "架空の依頼"],
      ["her", "00:02", "架空の着手"],
      ["her", "00:03", "架空の区切り", 0],
    ])
  })

  it("段が移っても段のまとめが空なら（中間レポートが出ないので）付かない", () => {
    expect(
      rowsOf([
        requestRecord({ time: at(1) }),
        plan(0, ""),
        speechRecord({ text: "架空の区切り", time: at(2) }),
        plan(1, ""),
      ]),
    ).toEqual([
      ["you", "00:01", "架空の依頼"],
      ["her", "00:02", "架空の区切り"],
    ])
  })

  it("間に別のセリフが挟まれば、ワークプランと隣り合うセリフにだけ付く", () => {
    expect(
      rowsOf([
        requestRecord({ time: at(1) }),
        plan(0, ""),
        plan(1, "架空のまとめ"),
        speechRecord({ text: "架空の区切り", time: at(2) }),
        speechRecord({ text: "架空の続き", time: at(3) }),
      ]),
    ).toEqual([
      ["you", "00:01", "架空の依頼"],
      ["her", "00:02", "架空の区切り", 0],
      ["her", "00:03", "架空の続き"],
    ])
  })

  it("押した相づちの札は you の行になり、札のあとのセリフの位置は turnSpeeches と同じ", () => {
    const records = [
      requestRecord({ time: at(1) }),
      plan(0, ""),
      speechRecord({ text: "架空の着手", time: at(2) }),
      chip("架空の札", at(3)),
      speechRecord({ text: "架空の区切り", time: at(4) }),
      plan(1, "架空のまとめ"),
    ]
    expect(rowsOf(records)).toEqual([
      ["you", "00:01", "架空の依頼"],
      ["her", "00:02", "架空の着手"],
      ["you", "00:03", "架空の札"],
      ["her", "00:04", "架空の区切り", 0],
    ])
    const last = talkFlowOf(records, "UTC").at(-1)
    const index = last?.kind === "her" ? last.target.index : -1
    expect(index).toBe(2)
    expect(turnSpeeches(records)[0]?.speeches[index]?.text).toBe("架空の区切り")
  })

  it("セリフと段を終えたワークプランの間に相づちの札が挟まっても対になる", () => {
    expect(
      rowsOf([
        requestRecord({ time: at(1) }),
        plan(0, ""),
        speechRecord({ text: "架空の区切り", time: at(2) }),
        chip("架空の札", at(3)),
        plan(1, "架空のまとめ"),
      ]),
    ).toEqual([
      ["you", "00:01", "架空の依頼"],
      ["her", "00:02", "架空の区切り", 0],
      ["you", "00:03", "架空の札"],
    ])
  })

  it("記録が空なら流れも空", () => {
    expect(talkFlowOf([], "UTC", "きみ")).toEqual([])
  })
})
