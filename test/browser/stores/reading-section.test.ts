import { afterEach, describe, expect, it } from "vitest"

import { readingSectionOf, useReadingSection } from "../../../src/browser/stores/reading-section.ts"

const HEADINGS = [
  { level: "section", text: "変わったこと" },
  { level: "sub", text: "小さな点" },
  { level: "section", text: "確かめたこと" },
  { level: "sub", text: "撮り直し" },
] as const

afterEach(() => {
  useReadingSection.getState().clear()
})

describe("readingSectionOf", () => {
  it("位置にいちばん近い手前の `##` を返す", () => {
    expect(readingSectionOf({ headings: HEADINGS, activeIndex: 0, reached: true })).toEqual({
      kind: "shown",
      text: "変わったこと",
    })
    expect(readingSectionOf({ headings: HEADINGS, activeIndex: 2, reached: true })).toEqual({
      kind: "shown",
      text: "確かめたこと",
    })
  })

  it("`###` の途中にいても親の `##` を返す", () => {
    expect(readingSectionOf({ headings: HEADINGS, activeIndex: 1, reached: true })).toEqual({
      kind: "shown",
      text: "変わったこと",
    })
    expect(readingSectionOf({ headings: HEADINGS, activeIndex: 3, reached: true })).toEqual({
      kind: "shown",
      text: "確かめたこと",
    })
  })

  it("まだ見出しを通っていなければ出さない", () => {
    expect(readingSectionOf({ headings: HEADINGS, activeIndex: 0, reached: false })).toEqual({
      kind: "none",
    })
  })

  it("手前に `##` が無ければ出さない", () => {
    expect(
      readingSectionOf({
        headings: [{ level: "sub", text: "先頭の小節" }],
        activeIndex: 0,
        reached: true,
      }),
    ).toEqual({ kind: "none" })
  })

  it("見出しが無ければ出さない", () => {
    expect(readingSectionOf({ headings: [], activeIndex: 0, reached: true })).toEqual({
      kind: "none",
    })
  })
})

describe("useReadingSection の action", () => {
  it("同じ並びを置き直しても状態を替えない", () => {
    useReadingSection.getState().showHeadings(HEADINGS)
    const before = useReadingSection.getState()
    useReadingSection.getState().showHeadings(HEADINGS.map((heading) => ({ ...heading })))
    expect(useReadingSection.getState()).toBe(before)
  })

  it("同じ位置を書き直しても状態を替えない", () => {
    useReadingSection.getState().readAt(2, true)
    const before = useReadingSection.getState()
    useReadingSection.getState().readAt(2, true)
    expect(useReadingSection.getState()).toBe(before)
  })

  it("読んだ位置の書き込みでは移る頼みを出さない", () => {
    useReadingSection.getState().showHeadings(HEADINGS)
    useReadingSection.getState().readAt(2, true)
    expect(useReadingSection.getState().jump).toEqual({ kind: "none" })
  })

  it("まだ通っていないときの「後ろ」は最初の見出しへ移る", () => {
    useReadingSection.getState().showHeadings(HEADINGS)
    useReadingSection.getState().move("newer")
    const state = useReadingSection.getState()
    expect([state.activeIndex, state.reached]).toEqual([0, true])
    expect(state.jump).toMatchObject({ kind: "requested", index: 0 })
  })

  it("前後へ1つずつ移り、移るたびに新しい頼みを出す", () => {
    useReadingSection.getState().showHeadings(HEADINGS)
    useReadingSection.getState().readAt(1, true)
    useReadingSection.getState().move("newer")
    const first = useReadingSection.getState().jump
    useReadingSection.getState().move("older")
    const second = useReadingSection.getState().jump
    expect(useReadingSection.getState().activeIndex).toBe(1)
    expect(first).toMatchObject({ kind: "requested", index: 2 })
    expect(second).toMatchObject({ kind: "requested", index: 1 })
    expect(second).not.toEqual(first)
  })

  it("並びの外へは移らない", () => {
    useReadingSection.getState().showHeadings(HEADINGS)
    useReadingSection.getState().readAt(3, true)
    const before = useReadingSection.getState()
    useReadingSection.getState().move("newer")
    expect(useReadingSection.getState()).toBe(before)

    useReadingSection.getState().readAt(0, false)
    useReadingSection.getState().move("older")
    expect(useReadingSection.getState().jump).toEqual({ kind: "none" })
  })

  it("見出しが無ければ移らない", () => {
    useReadingSection.getState().move("newer")
    expect(useReadingSection.getState().jump).toEqual({ kind: "none" })
  })
})
