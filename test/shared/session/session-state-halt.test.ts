import { describe, expect, it } from "vitest"

import { apply } from "../../fixture/session-state.ts"

describe("applySessionEvent（定着の停止）", () => {
  it("chat-consolidation-halted で止めた印と回数が立つ", () => {
    expect(apply().chatConsolidationHalt).toEqual({ halted: false })
    const view = apply({ kind: "chat-consolidation-halted", failures: 3 })

    expect(view.chatConsolidationHalt).toEqual({ halted: true, failures: 3 })
  })
})
