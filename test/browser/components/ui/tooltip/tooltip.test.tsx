import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Tooltip } from "../../../../../src/browser/components/ui/tooltip/tooltip.tsx"

afterEach(cleanup)

describe("Tooltip", () => {
  it("口にフォーカスが来ると、一行の中身が role=tooltip の面として口に結ばれる", () => {
    const { container } = render(
      <Tooltip content="一行の中身" placement="below">
        <button type="button">口</button>
      </Tooltip>,
    )
    const button = container.querySelector("button")
    if (button === null) throw new Error("口のボタンが無い")
    act(() => {
      button.focus()
    })
    const tip = document.querySelector("[role='tooltip']")
    expect(tip?.textContent).toContain("一行の中身")
  })
})
