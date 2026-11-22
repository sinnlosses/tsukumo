import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ClickableCard } from "../../../../../src/browser/components/ui/clickable-card/clickable-card.tsx"

afterEach(() => {
  cleanup()
})

describe("ClickableCard", () => {
  it("読み上げの名前が label のボタンになり、押すと onClick が呼ばれる", () => {
    const onClick = vi.fn<() => void>()
    render(
      <ClickableCard label="dummy-card" tone="plain" onClick={onClick} className="">
        dummy-body
      </ClickableCard>,
    )
    fireEvent.click(screen.getByRole("button", { name: "dummy-card" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it.each(["plain", "accent", "danger", "dashed"] as const)(
    "tone: %s を根の data-tone に出す",
    (tone) => {
      const { container } = render(
        <ClickableCard label="dummy-card" tone={tone} onClick={() => {}} className="">
          dummy-body
        </ClickableCard>,
      )
      expect(container.firstElementChild?.getAttribute("data-tone")).toBe(tone)
    },
  )
})
