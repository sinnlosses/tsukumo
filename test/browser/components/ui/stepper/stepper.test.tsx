import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Step,
  Stepper,
  type StepperProgress,
} from "../../../../../src/browser/components/ui/stepper/stepper.tsx"

afterEach(cleanup)

function renderSteps(progress: StepperProgress): HTMLElement {
  return render(
    <Stepper progress={progress} label="手順" density="compact" textSize="standard">
      <Step step={0} label="済み" />
      <Step step={1} label="今" />
      <Step step={2} label="これから" />
    </Stepper>,
  ).container
}

describe("Stepper", () => {
  it("強調ありのときだけ、強調の印が列に付き、題は進み具合の印を持つ", () => {
    const emphasized = renderSteps({ kind: "progress", activeStep: 1, emphasizeActive: true })
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

    const plain = renderSteps({ kind: "progress", activeStep: 1, emphasizeActive: false })
    expect(plain.querySelector("ol")?.getAttribute("data-emphasis")).toBe("none")
  })

  it("進み具合の無い並びは、番号を線の上に置き、列に sequence の印が付く", () => {
    const ol = renderSteps({ kind: "sequence" }).querySelector("ol")

    expect(ol?.getAttribute("data-emphasis")).toBe("sequence")
    expect(ol?.getAttribute("data-indicator-position")).toBe("on-track")
  })

  it("題の字の段の口は、列に data-text-size として出る", () => {
    const { container } = render(
      <Stepper
        progress={{ kind: "progress", activeStep: 0, emphasizeActive: false }}
        label="手順"
        density="compact"
        textSize="secondary"
      >
        <Step step={0} label="題" />
      </Stepper>,
    )

    expect(container.querySelector("ol")?.getAttribute("data-text-size")).toBe("secondary")
  })
})
