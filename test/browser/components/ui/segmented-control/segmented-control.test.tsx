import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SegmentedControl } from "../../../../../src/browser/components/ui/segmented-control/segmented-control.tsx"

afterEach(() => {
  cleanup()
})

const ITEMS = [
  { value: "a", label: "ダミーA", icon: <span data-testid="dummy-icon">印</span> },
  { value: "b", label: "ダミーB" },
] as const

describe("SegmentedControl", () => {
  it("選んでいる値の項目だけが aria-checked の radio になる", () => {
    render(
      <SegmentedControl label="ダミー" value="b" items={ITEMS} onChange={vi.fn<() => void>()} />,
    )

    expect(screen.getByRole("radiogroup", { name: "ダミー" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: /ダミーB/ }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: /ダミーA/ }).getAttribute("aria-checked")).toBe(
      "false",
    )
  })

  it("別の項目を押すとその value で onChange が呼ばれる", () => {
    const onChange = vi.fn<(value: "a" | "b") => void>()
    render(<SegmentedControl label="ダミー" value="b" items={ITEMS} onChange={onChange} />)

    fireEvent.click(screen.getByRole("radio", { name: /ダミーA/ }))

    expect(onChange).toHaveBeenCalledWith("a")
  })

  it("icon が項目の中に出る", () => {
    render(
      <SegmentedControl label="ダミー" value="b" items={ITEMS} onChange={vi.fn<() => void>()} />,
    )

    const radio = screen.getByRole("radio", { name: /ダミーA/ })
    expect(radio.contains(screen.getByTestId("dummy-icon"))).toBe(true)
  })
})
