import { beforeEach, describe, expect, it } from "vitest"

import { useInterimViewing } from "../../../src/browser/stores/interim-viewing.ts"

beforeEach(() => {
  useInterimViewing.setState(useInterimViewing.getInitialState(), true)
})

describe("useInterimViewing", () => {
  it("見たやり取りと読んだ節の番号を覚える", () => {
    const store = useInterimViewing.getState()
    store.markViewed(2)
    store.markRead(2, 3)
    store.markRead(2, 3)

    expect(useInterimViewing.getState().viewed[2]).toBe(true)
    expect(useInterimViewing.getState().read[2]).toEqual([3])
  })

  it("同じ世代で呼び直しても残り、世代が変わったら全部忘れる", () => {
    useInterimViewing.getState().forgetUnlessGeneration(1)
    useInterimViewing.getState().markViewed(2)
    useInterimViewing.getState().markRead(2, 0)

    useInterimViewing.getState().forgetUnlessGeneration(1)
    expect(useInterimViewing.getState().viewed[2]).toBe(true)
    expect(useInterimViewing.getState().read[2]).toEqual([0])

    useInterimViewing.getState().forgetUnlessGeneration(2)
    expect(useInterimViewing.getState().viewed[2]).toBeUndefined()
    expect(useInterimViewing.getState().read[2]).toBeUndefined()
  })
})
