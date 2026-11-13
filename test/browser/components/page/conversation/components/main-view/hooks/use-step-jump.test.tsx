import { act, cleanup, render } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useStepJumpLanding } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-step-jump.ts"
import { useStepJump } from "../../../../../../../../src/browser/components/page/conversation/stores/step-jump.ts"

const TURN_ID = 3

/** 経過の畳みの中に、畳んだ中間レポートが1つあるやり取り。 */
function Probe(): ReactElement {
  useStepJumpLanding(TURN_ID)
  return (
    <main data-region="main">
      <details data-testid="progress">
        <summary>架空の経過</summary>
        <details data-step-id="2" data-testid="step">
          <summary>架空の段</summary>
        </details>
      </details>
    </main>
  )
}

afterEach(() => {
  cleanup()
  useStepJump.getState().settleJump()
})

function element(testId: string): HTMLDetailsElement {
  const found = document.querySelector(`[data-testid="${testId}"]`)
  if (!(found instanceof HTMLDetailsElement)) {
    throw new Error(`${testId} が無い`)
  }
  return found
}

describe("useStepJumpLanding（流れから頼まれた紙の段へ移る）", () => {
  it("このターンの段を頼まれたら、包む畳みごと開いて転がし、目印を付けて合図を下ろす", () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    render(<Probe />)

    act(() => {
      useStepJump.getState().requestJump({ turnId: TURN_ID, stepId: 2 })
    })

    expect([element("progress").open, element("step").open]).toEqual([true, true])
    expect(scrollIntoView.mock.contexts).toEqual([element("step")])
    expect(element("step").dataset["jumped"]).toBe("true")
    expect(useStepJump.getState().jump).toEqual({ kind: "none" })
  })

  it("合図が先に出ていても、あとから付いた受け手が受け取る（ターンを切り替えた直後）", () => {
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    useStepJump.getState().requestJump({ turnId: TURN_ID, stepId: 2 })

    render(<Probe />)

    expect(element("step").dataset["jumped"]).toBe("true")
    expect(useStepJump.getState().jump).toEqual({ kind: "none" })
  })

  it("別のターンの段の合図には触らず、受け手が付くまで残す", () => {
    render(<Probe />)

    act(() => {
      useStepJump.getState().requestJump({ turnId: TURN_ID + 1, stepId: 2 })
    })

    expect(element("step").open).toBe(false)
    expect(useStepJump.getState().jump).toEqual({
      kind: "pending",
      turnId: TURN_ID + 1,
      stepId: 2,
    })
  })
})
