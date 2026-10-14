import { afterEach, describe, expect, it } from "vitest"

import { useWorkStripSteps } from "../../../src/browser/stores/work-strip-steps.ts"

afterEach(() => {
  useWorkStripSteps.setState(useWorkStripSteps.getInitialState(), true)
})

describe("useWorkStripSteps の openAtPhase", () => {
  it("段を指して開き、開いたままもう一度指すと閉じずに合図だけ進む", () => {
    useWorkStripSteps.getState().openAtPhase(3, 0)
    const first = useWorkStripSteps.getState().opened

    useWorkStripSteps.getState().openAtPhase(3, 0)
    const second = useWorkStripSteps.getState().opened

    expect(first).toEqual({
      kind: "open",
      exchange: 3,
      landing: { kind: "phase", phaseIndex: 0, signal: 1 },
    })
    expect(second).toEqual({
      kind: "open",
      exchange: 3,
      landing: { kind: "phase", phaseIndex: 0, signal: 2 },
    })
  })
})
