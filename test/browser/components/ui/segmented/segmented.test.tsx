import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Segmented } from "../../../../../src/browser/components/ui/segmented/segmented.tsx"

// Astryx の選択の動きは Web Animations を使い、happy-dom は取り外しの cancel を未処理の拒否にする。cancel を何もしない形にして避ける。
beforeEach(() => {
  vi.spyOn(Animation.prototype, "cancel").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const OPTIONS = [
  { value: "work", label: "架空の仕事" },
  { value: "chat", label: "架空の雑談" },
] as const

describe("Segmented", () => {
  it("選ばれた値だけが checked で、別の項目を押すと onChange を呼ぶ", () => {
    const onChange = vi.fn<(value: string) => void>()
    render(
      <Segmented ariaLabel="架空の切り替え" value="work" options={OPTIONS} onChange={onChange} />,
    )
    expect(screen.getByRole("radio", { name: "架空の仕事" }).getAttribute("aria-checked")).toBe(
      "true",
    )
    expect(screen.getByRole("radio", { name: "架空の雑談" }).getAttribute("aria-checked")).toBe(
      "false",
    )
    fireEvent.click(screen.getByRole("radio", { name: "架空の雑談" }))
    expect(onChange).toHaveBeenCalledWith("chat")
  })
})
