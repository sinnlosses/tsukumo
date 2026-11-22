import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Step, Stepper } from "../../../../../src/browser/components/ui/stepper/stepper.tsx"

afterEach(cleanup)

function renderSteps(emphasizeActive: boolean): HTMLElement {
  return render(
    <Stepper activeStep={1} label="手順" density="compact" emphasizeActive={emphasizeActive}>
      <Step step={0} label="済み" />
      <Step step={1} label="今" />
      <Step step={2} label="これから" />
    </Stepper>,
  ).container
}

describe("Stepper", () => {
  it("強調ありのときだけ、強調の印が列に付き、題は進み具合の印を持つ", () => {
    const emphasized = renderSteps(true)
    const labels = [...emphasized.querySelectorAll("span[data-progress]")].map((el) => [
      el.textContent,
      el.getAttribute("data-progress"),
    ])
    expect(labels).toEqual([
      ["済み", "completed"],
      ["今", "in-progress"],
      ["これから", "not-started"],
    ])
    expect(emphasized.querySelector("ol")?.getAttribute("data-emphasis")).toBe("active")
    cleanup()

    expect(renderSteps(false).querySelector("ol")?.getAttribute("data-emphasis")).toBe("none")
  })
})
