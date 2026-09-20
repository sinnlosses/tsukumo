import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, render, screen } from "@testing-library/react"

import { publishBrushTip, useBrushTip } from "../../../src/browser/stores/brush-tip.ts"

function Probe(): string {
  const tip = useBrushTip()
  return tip === undefined
    ? "筆先なし"
    : `${String(tip.x)},${String(tip.top)},${String(tip.bottom)}`
}

afterEach(() => {
  cleanup()
  publishBrushTip(undefined)
})

describe("筆先（BrushTip）", () => {
  it("何も書かれていなければ undefined", () => {
    render(<Probe />)

    expect(screen.getByText("筆先なし")).toBeDefined()
  })

  it("配られた筆先が読める", () => {
    render(<Probe />)

    act(() => {
      publishBrushTip({ x: 120, top: 40, bottom: 60 })
    })

    expect(screen.getByText("120,40,60")).toBeDefined()
  })

  it("演出が終わったら消える", () => {
    render(<Probe />)
    act(() => {
      publishBrushTip({ x: 120, top: 40, bottom: 60 })
    })

    act(() => {
      publishBrushTip(undefined)
    })

    expect(screen.getByText("筆先なし")).toBeDefined()
  })
})
