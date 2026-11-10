import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Select } from "../../../../../src/browser/components/ui/select/select.tsx"

afterEach(() => {
  cleanup()
})

describe("Select", () => {
  it("開く口の名前は ariaLabel で、字は選んでいる選択肢の名前。押すと選択肢が並ぶ", () => {
    render(
      <Select
        id="dummy-select"
        ariaLabel="ダミー"
        frameClassName="dummy-select-frame"
        className="dummy-select"
        value="b"
        disabled={false}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
        onChange={() => {}}
      />,
    )

    const trigger = screen.getByRole("combobox", { name: "ダミー" })
    expect(trigger.textContent).toContain("B")

    fireEvent.click(trigger)

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["A", "B"])
  })

  it("disabled のときは開く口が押せない状態（aria-disabled）になり、理由の字が付く", () => {
    render(
      <Select
        id="dummy-select"
        ariaLabel="ダミー"
        frameClassName="dummy-select-frame"
        className="dummy-select"
        value="a"
        disabled={true}
        title="架空の理由"
        options={[{ value: "a", label: "A" }]}
        onChange={() => {}}
      />,
    )

    const trigger = screen.getByRole("combobox", { name: "ダミー" })
    expect(trigger.getAttribute("aria-disabled")).toBe("true")
    expect(document.body.textContent).toContain("架空の理由")
  })

  it("選択肢を押すと onChange に選ばれた値を渡す", () => {
    const calls: string[] = []
    render(
      <Select
        id="dummy-select"
        ariaLabel="ダミー"
        frameClassName="dummy-select-frame"
        className="dummy-select"
        value="a"
        disabled={false}
        title={undefined}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
        onChange={(value) => calls.push(value)}
      />,
    )

    fireEvent.click(screen.getByRole("combobox", { name: "ダミー" }))
    fireEvent.click(screen.getByRole("option", { name: "B" }))

    expect(calls).toEqual(["b"])
  })
})
