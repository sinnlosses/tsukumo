import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TextField } from "../../../../../src/browser/components/ui/text-field/text-field.tsx"
import { typedElement } from "../../../../typed-element.ts"

afterEach(() => {
  cleanup()
})

describe("TextField", () => {
  it("element が input のときは 1 行の <input> を描き、入力した値を onChange に渡す", () => {
    const onChange = vi.fn<(value: string) => void>()
    render(
      <TextField
        element="input"
        id="dummy-field"
        className="dummy-field"
        value="a"
        maxLength={5}
        placeholder="ダミー"
        onChange={onChange}
      />,
    )

    const field = typedElement(
      screen.getByPlaceholderText("ダミー"),
      HTMLInputElement,
      "ダミーの <input>",
    )
    expect(field.maxLength).toBe(5)
    fireEvent.change(field, { target: { value: "ab" } })
    expect(onChange).toHaveBeenCalledWith("ab")
  })

  it("element が textarea のときは複数行の <textarea> を描き、入力した値を onChange に渡す", () => {
    const onChange = vi.fn<(value: string) => void>()
    render(
      <TextField
        element="textarea"
        id="dummy-field"
        className="dummy-field"
        value="a"
        maxLength={undefined}
        placeholder="ダミー"
        onChange={onChange}
      />,
    )

    const field = typedElement(
      screen.getByPlaceholderText("ダミー"),
      HTMLTextAreaElement,
      "ダミーの <textarea>",
    )
    fireEvent.change(field, { target: { value: "ab" } })
    expect(onChange).toHaveBeenCalledWith("ab")
  })
})
