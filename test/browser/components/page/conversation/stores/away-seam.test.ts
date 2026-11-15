import { beforeEach, describe, expect, it } from "vitest"

import { useAwaySeam } from "../../../../../../src/browser/components/page/conversation/stores/away-seam.ts"

const HIDDEN = { generation: 1, turnId: 3, rowCount: 5, hiddenAt: 1_000_000 }

describe("useAwaySeam", () => {
  beforeEach(() => {
    useAwaySeam.setState({ hidden: undefined, away: undefined })
  })

  it("30秒以上隠れて戻ると、前に見た位置と離れていた時間を残す", () => {
    useAwaySeam.getState().markHidden(HIDDEN)
    useAwaySeam.getState().markVisible(HIDDEN.hiddenAt + 4 * 60_000)

    expect(useAwaySeam.getState().away).toEqual({
      generation: 1,
      turnId: 3,
      rowCount: 5,
      awayMs: 4 * 60_000,
    })
  })

  it("30秒未満で戻ったときは残さない", () => {
    useAwaySeam.getState().markHidden(HIDDEN)
    useAwaySeam.getState().markVisible(HIDDEN.hiddenAt + 29_000)

    expect(useAwaySeam.getState().away).toBeUndefined()
  })

  it("もう一度隠れると前の記録を外す", () => {
    useAwaySeam.getState().markHidden(HIDDEN)
    useAwaySeam.getState().markVisible(HIDDEN.hiddenAt + 60_000)
    useAwaySeam.getState().markHidden({ ...HIDDEN, hiddenAt: HIDDEN.hiddenAt + 90_000 })

    expect(useAwaySeam.getState().away).toBeUndefined()
  })

  it("dismiss で外す", () => {
    useAwaySeam.getState().markHidden(HIDDEN)
    useAwaySeam.getState().markVisible(HIDDEN.hiddenAt + 60_000)
    useAwaySeam.getState().dismiss()

    expect(useAwaySeam.getState().away).toBeUndefined()
  })
})
