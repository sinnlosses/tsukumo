import { afterEach, describe, expect, it } from "vitest"

import { AWAY_MIN_MS } from "../../../../../../src/browser/components/page/conversation/domain/away-brief.ts"
import { useAwayReturn } from "../../../../../../src/browser/components/page/conversation/stores/away-return.ts"

afterEach(() => {
  useAwayReturn.setState(useAwayReturn.getInitialState(), true)
})

describe("useAwayReturn", () => {
  it("3 分に満たずに戻れば、見えているに戻る", () => {
    useAwayReturn.getState().hide(1000)
    useAwayReturn.getState().show(1000 + AWAY_MIN_MS - 1)

    expect(useAwayReturn.getState().away).toEqual({ kind: "present" })
  })

  it("3 分以上離れて戻れば、離れていた時間を持つ", () => {
    useAwayReturn.getState().hide(1000)
    useAwayReturn.getState().show(1000 + AWAY_MIN_MS)

    expect(useAwayReturn.getState().away).toEqual({ kind: "returned", awayMs: AWAY_MIN_MS })
  })

  it("dismiss で畳む", () => {
    useAwayReturn.getState().hide(0)
    useAwayReturn.getState().show(AWAY_MIN_MS)
    useAwayReturn.getState().dismiss()

    expect(useAwayReturn.getState().away).toEqual({ kind: "present" })
  })
})
