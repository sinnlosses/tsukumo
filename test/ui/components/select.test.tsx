import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { Select } from "../../../src/ui/components/select.tsx"

afterEach(() => {
  cleanup()
})

describe("Select", () => {
  it("選択肢を出し、value を選択する", () => {
    render(
      <Select
        id="dummy-select"
        ariaLabel="ダミー"
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

    const select = screen.getByLabelText("ダミー") as HTMLSelectElement
    expect(select.value).toBe("b")
    expect(screen.getByText("A")).toBeDefined()
    expect(screen.getByText("B")).toBeDefined()
  })

  it("変更で onChange に選ばれた値を渡す", () => {
    const calls: string[] = []
    render(
      <Select
        id="dummy-select"
        ariaLabel="ダミー"
        className="dummy-select"
        value="a"
        disabled={false}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
        onChange={(value) => calls.push(value)}
      />,
    )

    fireEvent.change(screen.getByLabelText("ダミー"), { target: { value: "b" } })

    expect(calls).toEqual(["b"])
  })
})
