import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Field, type FieldProps } from "../../../../../src/browser/components/ui/field/field.tsx"
import { TextField } from "../../../../../src/browser/components/ui/text-field/text-field.tsx"
import { typedElement } from "../../../../typed-element.ts"

afterEach(() => {
  cleanup()
})

const BASE_PROPS = {
  variant: "form",
  id: "dummy-field",
  label: "ダミーの名札",
  hint: undefined,
} satisfies Omit<FieldProps, "children">

function renderField(props: Omit<FieldProps, "children">): void {
  render(
    <Field {...props}>
      <TextField
        element="input"
        id={props.id}
        className=""
        value=""
        maxLength={undefined}
        placeholder={undefined}
        onChange={() => undefined}
      />
    </Field>,
  )
}

describe("Field", () => {
  it("名札が、同じ id の入力欄を指す（名札を押した焦点移動はブラウザが `control` を使って行う）", () => {
    renderField(BASE_PROPS)

    const input = screen.getByRole("textbox", { name: "ダミーの名札" })
    const label = typedElement(screen.getByText("ダミーの名札"), HTMLLabelElement, "ダミーの名札")
    expect(label.htmlFor).toBe("dummy-field")
    expect(label.control).toBe(input)
  })

  it("ヒントを渡すと描き、undefined のときは描かない", () => {
    renderField({ ...BASE_PROPS, hint: <span>ダミーのヒント</span> })
    expect(screen.getByText("ダミーのヒント")).toBeTruthy()

    cleanup()
    renderField(BASE_PROPS)
    expect(screen.queryByText("ダミーのヒント")).toBeNull()
  })
})
