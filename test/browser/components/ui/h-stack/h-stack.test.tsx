import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import {
  HStack,
  type HStackProps,
} from "../../../../../src/browser/components/ui/h-stack/h-stack.tsx"

afterEach(() => {
  cleanup()
})

// `HStack` は `direction: "row"` を固定して `Stack` へそのまま渡す薄い部品（`h-stack.tsx`）。
// gap・align・justify・className の class 対応表は `Stack` 自身の `stack.test.tsx` が測るので、
// ここで測るのは direction を固定していることだけ。

const BASE_PROPS = {
  element: "div",
  gap: "none",
  align: "stretch",
  justify: "start",
  wrap: "nowrap",
  className: "",
} satisfies Omit<HStackProps, "children">

describe("HStack", () => {
  it("Stack に direction: row を渡して描く（stack-direction-row が付く）", () => {
    render(
      <HStack {...BASE_PROPS}>
        <span data-testid="h-stack-child">child</span>
      </HStack>,
    )

    const child = screen.getByTestId("h-stack-child")
    const parent = child.parentElement
    if (parent === null) {
      throw new Error("HStack が親要素を描いていない")
    }
    expect(parent.className.split(" ")).toContain("stack-direction-row")
    expect(parent.className.split(" ")).not.toContain("stack-direction-column")
  })
})
