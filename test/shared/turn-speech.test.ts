import { describe, expect, it } from "bun:test"

import { MAX_MAIN_VIEW_TURNS, mainViewEntries, mainViewTurns } from "../../src/shared/main-view.ts"
import { INITIAL_SESSION_STATE, type SessionRecord } from "../../src/shared/session-state.ts"
import { turnSpeeches } from "../../src/shared/turn-speech.ts"
import { PRE_REQUEST_TURN_ID } from "../../src/shared/turn.ts"
import {
  compactBoundaryRecord,
  detailRecord,
  requestRecord,
  speechRecord,
} from "../fixture/session-record.ts"

// フィクスチャはすべて手で書いた架空の依頼・セリフ（docs/coding-standards.md「会話内容の扱い」）。

describe("turnSpeeches（依頼を境目にセリフを分ける）", () => {
  it("依頼ごとに分かれ、各ターンのセリフだけを古い→新しいの順で返す", () => {
    const turns = turnSpeeches([
      requestRecord({ text: "1つ目の依頼", turnId: 0 }),
      speechRecord({ text: "1つ目のセリフA" }),
      detailRecord("1つ目のレポート"),
      speechRecord({ text: "1つ目のセリフB" }),
      requestRecord({ text: "2つ目の依頼", turnId: 1 }),
      speechRecord({ text: "2つ目のセリフ" }),
    ])

    expect(turns.map((turn) => turn.speeches)).toEqual([
      ["1つ目のセリフA", "1つ目のセリフB"],
      ["2つ目のセリフ"],
    ])
  })

  it("セリフの無いターンは空になる（ターン自体は消えない）", () => {
    const turns = turnSpeeches([
      requestRecord({ text: "1つ目の依頼", turnId: 0 }),
      speechRecord({ text: "1つ目のセリフ" }),
      requestRecord({ text: "2つ目の依頼", turnId: 1 }),
      detailRecord("2つ目のレポート"),
      requestRecord({ text: "3つ目の依頼", turnId: 2 }),
      speechRecord({ text: "3つ目のセリフ" }),
    ])

    expect(turns.map((turn) => turn.speeches)).toEqual([["1つ目のセリフ"], [], ["3つ目のセリフ"]])
    expect(turns[1]?.expression).toBeUndefined()
  })

  it("表情はそのターンの最後のセリフのもの", () => {
    const turns = turnSpeeches([
      requestRecord({ text: "1つ目の依頼", turnId: 0 }),
      speechRecord({ text: "1つ目のセリフA", expression: "proud" }),
      speechRecord({ text: "1つ目のセリフB", expression: "default" }),
      requestRecord({ text: "2つ目の依頼", turnId: 1 }),
      speechRecord({ text: "2つ目のセリフ", expression: "proud" }),
    ])

    expect(turns.map((turn) => turn.expression)).toEqual(["default", "proud"])
  })

  it("各ターンに依頼の文面が付き、依頼より前のまとまりには付かない", () => {
    const turns = turnSpeeches([
      speechRecord({ text: "依頼より前のセリフ" }),
      requestRecord({ text: "1つ目の依頼", turnId: 0 }),
      speechRecord({ text: "1つ目のセリフ" }),
    ])

    expect(turns.map((turn) => turn.request)).toEqual([undefined, "1つ目の依頼"])
  })

  it("記録が空なら空を返す", () => {
    expect(turnSpeeches([])).toEqual([])
  })
})

describe("turnSpeeches（通し番号）", () => {
  it("ターンの通し番号が mainViewTurns と揃う", () => {
    const records: readonly SessionRecord[] = [
      requestRecord({ text: "1つ目の依頼", turnId: 0 }),
      speechRecord({ text: "1つ目のセリフ" }),
      detailRecord("1つ目のレポート"),
      requestRecord({ text: "2つ目の依頼", turnId: 1 }),
      detailRecord("2つ目のレポート"),
      requestRecord({ text: "3つ目の依頼", turnId: 2 }),
      speechRecord({ text: "3つ目のセリフ" }),
      detailRecord("3つ目のレポート"),
    ]

    const viewTurns = mainViewTurns(mainViewEntries({ ...INITIAL_SESSION_STATE, records }), false)

    expect(turnSpeeches(records).map((turn) => turn.id)).toEqual(viewTurns.map((turn) => turn.id))
  })

  it("最初の依頼より前にレポートがあるときも、通し番号が mainViewTurns と揃う", () => {
    const records: readonly SessionRecord[] = [
      detailRecord("依頼より前のレポート"),
      speechRecord({ text: "依頼より前のセリフ" }),
      requestRecord({ text: "1つ目の依頼", turnId: 0 }),
      speechRecord({ text: "1つ目のセリフ" }),
      requestRecord({ text: "2つ目の依頼", turnId: 1 }),
      speechRecord({ text: "2つ目のセリフ" }),
    ]

    const viewTurns = mainViewTurns(mainViewEntries({ ...INITIAL_SESSION_STATE, records }), false)
    const speechTurns = turnSpeeches(records)

    expect(speechTurns.map((turn) => turn.id)).toEqual(viewTurns.map((turn) => turn.id))
    // 依頼より前のまとまり（`PRE_REQUEST_TURN_ID`）にも、そのぶんのセリフが入る。
    expect(speechTurns[0]).toEqual({
      id: PRE_REQUEST_TURN_ID,
      request: undefined,
      speeches: ["依頼より前のセリフ"],
      expression: "default",
    })
  })

  it("先頭が圧縮の区切りだけのときは、通し番号が mainViewTurns と揃う（前のまとまりを作らない）", () => {
    const records: readonly SessionRecord[] = [
      compactBoundaryRecord(),
      requestRecord({ text: "1つ目の依頼", turnId: 0 }),
      speechRecord({ text: "1つ目のセリフ" }),
    ]

    const viewTurns = mainViewTurns(mainViewEntries({ ...INITIAL_SESSION_STATE, records }), false)
    const speechTurns = turnSpeeches(records)

    expect(speechTurns.map((turn) => turn.id)).toEqual(viewTurns.map((turn) => turn.id))
    expect(speechTurns).toEqual([
      { id: 0, request: "1つ目の依頼", speeches: ["1つ目のセリフ"], expression: "default" },
    ])
  })

  it(`直近${String(MAX_MAIN_VIEW_TURNS)}ターンに絞られたあとも、窓の中の番号でそのターンのセリフが引ける`, () => {
    const turnCount = MAX_MAIN_VIEW_TURNS + 2
    const records: readonly SessionRecord[] = Array.from({ length: turnCount }, (_, index) => [
      requestRecord({ text: `依頼${String(index)}`, turnId: index }),
      speechRecord({ text: `セリフ${String(index)}` }),
      detailRecord(`レポート${String(index)}`),
    ]).flat()

    const viewTurns = mainViewTurns(mainViewEntries({ ...INITIAL_SESSION_STATE, records }), false)
    const speechTurns = turnSpeeches(records)

    const expectedIds = Array.from(
      { length: MAX_MAIN_VIEW_TURNS },
      (_, index) => turnCount - MAX_MAIN_VIEW_TURNS + index,
    )
    expect(viewTurns.map((turn) => turn.id)).toEqual(expectedIds)
    expect(
      viewTurns.map((turn) => speechTurns.find((candidate) => candidate.id === turn.id)?.speeches),
    ).toEqual(expectedIds.map((id) => [`セリフ${String(id)}`]))
  })
})
