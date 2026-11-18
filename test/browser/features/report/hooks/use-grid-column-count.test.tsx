import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { type ReactElement, useRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useGridColumnCount } from "../../../../../src/browser/features/report/hooks/use-grid-column-count.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Probe(): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null)
  const columns = useGridColumnCount(gridRef, 4)
  return (
    <div ref={gridRef} data-testid="grid">
      {String(columns)}
    </div>
  )
}

describe("useGridColumnCount", () => {
  it("余白の札の横の印が付くと1列に積み、外れると幅で決めた列の数に戻る", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(2000)
    render(<Probe />)
    const grid = screen.getByTestId("grid")
    expect(grid.textContent).toBe("4")

    grid.setAttribute("data-beside-card", "")
    await waitFor(() => {
      expect(grid.textContent).toBe("1")
    })
    grid.removeAttribute("data-beside-card")
    await waitFor(() => {
      expect(grid.textContent).toBe("4")
    })
  })
})
