import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Lamp, type LampStepState } from "../../../../../src/browser/components/ui/lamp/lamp.tsx"
import { typedElement } from "../../../../typed-element.ts"

afterEach(() => {
  cleanup()
})

function renderedStep(state: LampStepState): { svg: SVGElement; paths: SVGPathElement[] } {
  const { container } = render(<Lamp kind="step" state={state} sizePx={16} />)
  const svg = typedElement(container.querySelector("svg"), SVGElement, "狐火")
  return { svg, paths: [...svg.querySelectorAll("path")] }
}

describe("Lamp の段の印", () => {
  it("済みは塗り、芯は付けない", () => {
    const { paths } = renderedStep("done")
    expect(paths).toHaveLength(1)
    expect(paths[0]?.getAttribute("fill")).toBe("var(--accent)")
  })

  it("いまは塗りに芯が付き、済みより濃い", () => {
    const done = renderedStep("done").paths[0]?.getAttribute("fill-opacity")
    cleanup()
    const now = renderedStep("now")
    expect(now.paths).toHaveLength(2)
    expect(Number(now.paths[0]?.getAttribute("fill-opacity"))).toBeGreaterThan(Number(done))
  })

  it("これからは線だけで点線ではない", () => {
    const [flame] = renderedStep("todo").paths
    expect(flame?.getAttribute("fill")).toBe("none")
    expect(flame?.getAttribute("stroke-dasharray")).toBeNull()
  })

  it("飛ばしたは線だけで点線", () => {
    const [flame] = renderedStep("skipped").paths
    expect(flame?.getAttribute("fill")).toBe("none")
    expect(flame?.getAttribute("stroke-dasharray")).not.toBeNull()
  })

  it("渡した大きさで描く", () => {
    expect(renderedStep("done").svg.getAttribute("width")).toBe("16")
  })
})
