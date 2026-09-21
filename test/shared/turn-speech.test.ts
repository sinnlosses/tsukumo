import { describe, expect, it } from "bun:test"

import { MAX_MAIN_VIEW_TURNS, mainViewEntries, mainViewTurns } from "../../src/shared/main-view.ts"
import { INITIAL_SESSION_STATE, type SessionRecord } from "../../src/shared/session-state.ts"
import { turnSpeeches } from "../../src/shared/turn-speech.ts"

// フィクスチャはすべて手で書いた架空の依頼・セリフ（docs/coding-standards.md「会話内容の扱い」）。

const request = (text: string): SessionRecord => ({ kind: "request", text, images: [] })
const detail = (markdown: string): SessionRecord => ({ kind: "detail", markdown })
const speech = (text: string, expression: "default" | "proud" = "default"): SessionRecord => ({
  kind: "speech",
  text,
  expression,
})
const compactBoundary = (): SessionRecord => ({ kind: "compact-boundary" })

describe("turnSpeeches（依頼を境目にセリフを分ける）", () => {
  it("依頼ごとに分かれ、各ターンのセリフだけを古い→新しいの順で返す", () => {
    const turns = turnSpeeches([
      request("1つ目の依頼"),
      speech("1つ目のセリフA"),
      detail("1つ目のレポート"),
      speech("1つ目のセリフB"),
      request("2つ目の依頼"),
      speech("2つ目のセリフ"),
    ])

    expect(turns.map((turn) => turn.speeches)).toEqual([
      ["1つ目のセリフA", "1つ目のセリフB"],
      ["2つ目のセリフ"],
    ])
  })

  it("セリフの無いターンは空になる（ターン自体は消えない）", () => {
    const turns = turnSpeeches([
      request("1つ目の依頼"),
      speech("1つ目のセリフ"),
      request("2つ目の依頼"),
      detail("2つ目のレポート"),
      request("3つ目の依頼"),
      speech("3つ目のセリフ"),
    ])

    expect(turns.map((turn) => turn.speeches)).toEqual([["1つ目のセリフ"], [], ["3つ目のセリフ"]])
    expect(turns[1]?.expression).toBeUndefined()
  })

  it("表情はそのターンの最後のセリフのもの", () => {
    const turns = turnSpeeches([
      request("1つ目の依頼"),
      speech("1つ目のセリフA", "proud"),
      speech("1つ目のセリフB", "default"),
      request("2つ目の依頼"),
      speech("2つ目のセリフ", "proud"),
    ])

    expect(turns.map((turn) => turn.expression)).toEqual(["default", "proud"])
  })

  it("記録が空なら空を返す", () => {
    expect(turnSpeeches([])).toEqual([])
  })
})

describe("turnSpeeches（通し番号）", () => {
  it("ターンの通し番号が mainViewTurns と揃う", () => {
    const records: readonly SessionRecord[] = [
      request("1つ目の依頼"),
      speech("1つ目のセリフ"),
      detail("1つ目のレポート"),
      request("2つ目の依頼"),
      detail("2つ目のレポート"),
      request("3つ目の依頼"),
      speech("3つ目のセリフ"),
      detail("3つ目のレポート"),
    ]

    const viewTurns = mainViewTurns(mainViewEntries({ ...INITIAL_SESSION_STATE, records }), false)

    expect(turnSpeeches(records).map((turn) => turn.id)).toEqual(viewTurns.map((turn) => turn.id))
  })

  it("最初の依頼より前にレポートがあるときも、通し番号が mainViewTurns と揃う", () => {
    const records: readonly SessionRecord[] = [
      detail("依頼より前のレポート"),
      speech("依頼より前のセリフ"),
      request("1つ目の依頼"),
      speech("1つ目のセリフ"),
      request("2つ目の依頼"),
      speech("2つ目のセリフ"),
    ]

    const viewTurns = mainViewTurns(mainViewEntries({ ...INITIAL_SESSION_STATE, records }), false)
    const speechTurns = turnSpeeches(records)

    expect(speechTurns.map((turn) => turn.id)).toEqual(viewTurns.map((turn) => turn.id))
    // 依頼より前のまとまり（通し番号 0）にも、そのぶんのセリフが入る。
    expect(speechTurns[0]).toEqual({
      id: 0,
      speeches: ["依頼より前のセリフ"],
      expression: "default",
    })
  })

  it("先頭が圧縮の区切りだけのときは、通し番号が mainViewTurns と揃う（前のまとまりを作らない）", () => {
    const records: readonly SessionRecord[] = [
      compactBoundary(),
      request("1つ目の依頼"),
      speech("1つ目のセリフ"),
    ]

    const viewTurns = mainViewTurns(mainViewEntries({ ...INITIAL_SESSION_STATE, records }), false)
    const speechTurns = turnSpeeches(records)

    expect(speechTurns.map((turn) => turn.id)).toEqual(viewTurns.map((turn) => turn.id))
    expect(speechTurns).toEqual([{ id: 0, speeches: ["1つ目のセリフ"], expression: "default" }])
  })

  it(`直近${String(MAX_MAIN_VIEW_TURNS)}ターンに絞られたあとも、窓の中の番号でそのターンのセリフが引ける`, () => {
    const turnCount = MAX_MAIN_VIEW_TURNS + 2
    const records: readonly SessionRecord[] = Array.from({ length: turnCount }, (_, index) => [
      request(`依頼${String(index)}`),
      speech(`セリフ${String(index)}`),
      detail(`レポート${String(index)}`),
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
