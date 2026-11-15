import { describe, expect, it } from "vitest"

import { conversationStreamRows } from "../../../../src/browser/domain/main-view/conversation-stream.ts"
import type { SessionRecord } from "../../../../src/shared/session/session-record.ts"
import { splitIntoTurns } from "../../../../src/shared/session/turn.ts"
import {
  asideRecord,
  compactBoundaryRecord,
  detailRecord,
  reactionRecord,
  reportRecord,
  requestRecord,
  speechRecord,
  toolRecord,
  workPlanRecord,
} from "../../../fixture/session-record.ts"

const questionRecord: SessionRecord = {
  kind: "question",
  toolUseId: "fictional-question",
  questions: [],
  answers: [],
  briefs: [],
  imageSizes: [],
  unshelvedImages: [],
}

function rowsOf(records: readonly SessionRecord[]) {
  const [turn] = splitIntoTurns(records)
  if (turn === undefined) {
    throw new Error("やり取りが無い")
  }
  return conversationStreamRows(turn)
}

describe("conversationStreamRows（やり取り1つの記録を流れの行にする）", () => {
  it("記録の位置の順を保ち、時刻で並べ直さない", () => {
    const rows = rowsOf([
      requestRecord({ time: { kind: "stamped", at: 300 } }),
      speechRecord({ text: "あとの時刻", time: { kind: "stamped", at: 200 } }),
      speechRecord({ text: "さきの時刻", time: { kind: "stamped", at: 100 } }),
    ])

    expect(rows.map((row) => row.kind)).toEqual(["post", "say", "say"])
    expect(rows.flatMap((row) => (row.kind === "say" ? [row.record.text] : []))).toEqual([
      "あとの時刻",
      "さきの時刻",
    ])
  })

  it("tool と圧縮の区切りは流れに出さない", () => {
    const rows = rowsOf([requestRecord(), toolRecord(), compactBoundaryRecord(), speechRecord()])

    expect(rows.map((row) => row.kind)).toEqual(["post", "say"])
  })

  it("時刻の無い記録と restored の記録には時刻を付けない", () => {
    const rows = rowsOf([
      requestRecord({ time: { kind: "restored" } }),
      detailRecord(),
      questionRecord,
      speechRecord({ time: { kind: "recovered", at: 5 } }),
    ])

    expect(rows.map((row) => ("at" in row ? row.at : "なし"))).toEqual(["なし", "なし", "なし", 5])
  })

  it("補足は投稿、答えと反応は左の行、質問は届いた位置に出る", () => {
    const rows = rowsOf([
      requestRecord(),
      workPlanRecord(),
      questionRecord,
      asideRecord(),
      speechRecord({ answersAside: true }),
      reactionRecord(),
      detailRecord(),
      reportRecord(),
    ])

    expect(rows.map((row) => row.kind)).toEqual([
      "post",
      "step",
      "question",
      "post",
      "say",
      "say",
      "step",
      "report",
    ])
    expect(rows[3]).toMatchObject({ kind: "post", origin: "aside" })
  })

  it("依頼より前の記録だけのやり取りも流れにする", () => {
    const rows = rowsOf([speechRecord(), reportRecord()])

    expect(rows.map((row) => row.kind)).toEqual(["say", "report"])
  })
})
