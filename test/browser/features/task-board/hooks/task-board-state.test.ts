import { describe, expect, it } from "vitest"

import { tallyDraftSort } from "../../../../../src/browser/features/task-board/domain/draft-sort.ts"
import {
  boardReducer,
  initialBoardState,
} from "../../../../../src/browser/features/task-board/hooks/task-board-state.ts"

const CLOSED = { kind: "closed" } as const

describe("boardReducer のドラフトの仕分け", () => {
  it("既定は全部保留で、選んだ行だけが計画・却下になり、保留へ戻すと選びが消える", () => {
    let state = initialBoardState(CLOSED)
    expect(state.sort.choices).toEqual({})

    state = boardReducer(state, { kind: "sort", id: "ABC-1", choice: "plan" })
    state = boardReducer(state, { kind: "sort", id: "ABC-2", choice: "drop" })
    expect(state.sort.choices).toEqual({ "ABC-1": "plan", "ABC-2": "drop" })

    state = boardReducer(state, { kind: "sort", id: "ABC-1", choice: "hold" })
    expect(state.sort.choices).toEqual({ "ABC-2": "drop" })
  })

  it("却下の理由を行ごとに持ち、選びが変わっても理由は残る", () => {
    let state = initialBoardState(CLOSED)
    state = boardReducer(state, { kind: "sort", id: "ABC-2", choice: "drop" })
    state = boardReducer(state, { kind: "dropReason", id: "ABC-2", reason: "済み" })
    state = boardReducer(state, { kind: "sort", id: "ABC-2", choice: "plan" })
    expect(state.sort.reasons).toEqual({ "ABC-2": "済み" })
  })

  it("「仕分けを戻す」と閉じるで初めに戻る", () => {
    let state = initialBoardState(CLOSED)
    state = boardReducer(state, { kind: "sort", id: "ABC-1", choice: "plan" })
    state = boardReducer(state, { kind: "dropReason", id: "ABC-1", reason: "x" })
    const reset = boardReducer(state, { kind: "sortReset" })
    expect(reset.sort).toEqual({ choices: {}, reasons: {} })
    expect(boardReducer(state, { kind: "close" }).sort).toEqual({ choices: {}, reasons: {} })
  })

  it("絞り込みを替えても選びは残る", () => {
    let state = initialBoardState(CLOSED)
    state = boardReducer(state, { kind: "sort", id: "ABC-1", choice: "plan" })
    state = boardReducer(state, {
      kind: "filter",
      filter: "ready",
      shown: { kind: "none" },
    })
    expect(state.sort.choices).toEqual({ "ABC-1": "plan" })
  })
})

describe("tallyDraftSort", () => {
  const draftIds = ["ABC-1", "ABC-2", "ABC-3", "ABC-4"]

  it("一覧の順に計画・却下を並べ、保留の件数を数える", () => {
    const tally = tallyDraftSort(draftIds, {
      choices: { "ABC-3": "drop", "ABC-1": "plan", "ABC-2": "plan" },
      reasons: { "ABC-3": "済み" },
    })
    expect(tally.planCount).toBe(2)
    expect(tally.dropCount).toBe(1)
    expect(tally.holdCount).toBe(1)
    expect(tally.request).toEqual({
      kind: "sort",
      plans: ["ABC-1", "ABC-2"],
      drops: [{ id: "ABC-3", reason: "済み" }],
    })
  })

  it("1行だけ計画を選んだら、残りは保留のまま", () => {
    const tally = tallyDraftSort(draftIds, { choices: { "ABC-2": "plan" }, reasons: {} })
    expect([tally.planCount, tally.dropCount, tally.holdCount]).toEqual([1, 0, 3])
  })

  it("ドラフトでなくなった ID の選びは数えない", () => {
    const tally = tallyDraftSort(["ABC-1"], { choices: { "ABC-9": "plan" }, reasons: {} })
    expect([tally.planCount, tally.dropCount, tally.holdCount]).toEqual([0, 0, 1])
  })

  it("理由が無い却下は空の理由になる", () => {
    const tally = tallyDraftSort(draftIds, { choices: { "ABC-1": "drop" }, reasons: {} })
    expect(tally.request.drops).toEqual([{ id: "ABC-1", reason: "" }])
  })
})
