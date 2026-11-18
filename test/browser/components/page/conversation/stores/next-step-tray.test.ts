import { afterEach, describe, expect, it } from "vitest"

import {
  nextStepTrayFolded,
  nextStepTrayShown,
  useNextStepTray,
} from "../../../../../../src/browser/components/page/conversation/stores/next-step-tray.ts"
import type { NextStep } from "../../../../../../src/browser/features/report/domain/next-step-plan.ts"

afterEach(() => {
  useNextStepTray.setState(useNextStepTray.getInitialState(), true)
})

const STEPS: readonly NextStep[] = [
  {
    kind: "resume",
    kindLabel: "再開する",
    label: "架空の再開",
    note: "",
    draft: "架空の再開",
    points: 0,
  },
]

describe("useNextStepTray", () => {
  it("元が付くと出し、依頼を送って外すと次の元が付くまで出さない", () => {
    const store = useNextStepTray.getState()
    expect(nextStepTrayShown(useNextStepTray.getState())).toBe(false)

    store.attach("1:0", STEPS)
    expect(nextStepTrayShown(useNextStepTray.getState())).toBe(true)

    store.dismiss()
    expect(nextStepTrayShown(useNextStepTray.getState())).toBe(false)

    store.attach("2:0", STEPS)
    expect(nextStepTrayShown(useNextStepTray.getState())).toBe(true)
  })

  it("畳んだのは今の元だけで、同じ元が付き直しても畳んだまま、次の元が付くと開く", () => {
    const store = useNextStepTray.getState()
    store.attach("1:0", STEPS)
    store.fold()
    expect(nextStepTrayFolded(useNextStepTray.getState())).toBe(true)

    store.detach("1:0")
    store.attach("1:0", STEPS)
    expect(nextStepTrayFolded(useNextStepTray.getState())).toBe(true)

    store.attach("2:0", STEPS)
    expect(nextStepTrayFolded(useNextStepTray.getState())).toBe(false)
  })

  it("外すのは今の元だけで、先に付いた次の元は残す", () => {
    const store = useNextStepTray.getState()
    store.attach("1:0", STEPS)
    store.attach("2:0", STEPS)

    store.detach("1:0")
    expect(useNextStepTray.getState().reportKey).toBe("2:0")

    store.detach("2:0")
    expect(nextStepTrayShown(useNextStepTray.getState())).toBe(false)
  })
})
