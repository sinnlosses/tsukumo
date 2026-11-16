import { describe, expect, it } from "vitest"

import {
  chooseDraftSort,
  EMPTY_DRAFT_SORT,
  tallyDraftSort,
} from "../../../../../src/browser/features/task-board/domain/draft-sort.ts"

describe("chooseDraftSort", () => {
  it("選んだ行だけが計画・却下になり、あとでへ戻すと選びが消える", () => {
    let sort = chooseDraftSort(EMPTY_DRAFT_SORT, "ABC-1", "plan")
    sort = chooseDraftSort(sort, "ABC-2", "drop")
    expect(sort.choices).toEqual({ "ABC-1": "plan", "ABC-2": "drop" })

    sort = chooseDraftSort(sort, "ABC-1", "later")
    expect(sort.choices).toEqual({ "ABC-2": "drop" })
  })

  it("却下の理由は選びが変わっても残る", () => {
    const sort = chooseDraftSort(
      { choices: { "ABC-2": "drop" }, reasons: { "ABC-2": "済み" } },
      "ABC-2",
      "plan",
    )
    expect(sort.reasons).toEqual({ "ABC-2": "済み" })
  })
})

describe("tallyDraftSort", () => {
  const draftIds = ["ABC-1", "ABC-2", "ABC-3", "ABC-4"]

  it("一覧の順に計画・却下を並べ、あとでの件数を数える", () => {
    const tally = tallyDraftSort(draftIds, {
      choices: { "ABC-3": "drop", "ABC-1": "plan", "ABC-2": "plan" },
      reasons: { "ABC-3": "済み" },
    })
    expect(tally.planCount).toBe(2)
    expect(tally.dropCount).toBe(1)
    expect(tally.laterCount).toBe(1)
    expect(tally.request).toEqual({
      kind: "sort",
      plans: ["ABC-1", "ABC-2"],
      drops: [{ id: "ABC-3", reason: "済み" }],
    })
  })

  it("1行だけ計画を選んだら、残りはあとでのまま", () => {
    const tally = tallyDraftSort(draftIds, { choices: { "ABC-2": "plan" }, reasons: {} })
    expect([tally.planCount, tally.dropCount, tally.laterCount]).toEqual([1, 0, 3])
  })

  it("ドラフトでなくなった ID の選びは数えない", () => {
    const tally = tallyDraftSort(["ABC-1"], { choices: { "ABC-9": "plan" }, reasons: {} })
    expect([tally.planCount, tally.dropCount, tally.laterCount]).toEqual([0, 0, 1])
  })

  it("理由が無い却下は空の理由になる", () => {
    const tally = tallyDraftSort(draftIds, { choices: { "ABC-1": "drop" }, reasons: {} })
    expect(tally.request.drops).toEqual([{ id: "ABC-1", reason: "" }])
  })
})
