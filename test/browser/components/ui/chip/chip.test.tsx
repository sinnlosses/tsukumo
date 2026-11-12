import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Chip } from "../../../../../src/browser/components/ui/chip/chip.tsx"

afterEach(() => {
  cleanup()
})

describe("Chip", () => {
  it("語と数を並べ、押せない札は button にしない", () => {
    render(
      <Chip
        label="架空の札"
        count={{ kind: "shown", value: 3 }}
        action={{ kind: "static" }}
        className=""
      />,
    )
    expect(screen.queryByRole("button")).toBeNull()
    expect(document.body.textContent).toBe("架空の札3")
  })

  it("押せる札は押された状態を aria-pressed で伝え、押すと onClick を呼ぶ", () => {
    const onClick = vi.fn<() => void>()
    render(
      <Chip
        label="架空の札"
        count={{ kind: "none" }}
        action={{ kind: "button", pressed: true, onClick }}
        className=""
      />,
    )
    const button = screen.getByRole("button", { name: "架空の札" })
    expect(button.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
