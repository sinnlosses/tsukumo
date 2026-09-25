import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import {
  VStack,
  type VStackProps,
} from "../../../../../src/browser/components/ui/v-stack/v-stack.tsx"

afterEach(() => {
  cleanup()
})

// `VStack` は `direction: "column"` を固定して `Stack` へそのまま渡す薄い部品（`v-stack.tsx`）。
// gap・align・justify・className の class 対応表は `Stack` 自身の `stack.test.tsx` が測るので、
// ここで測るのは direction を固定していることだけ。

const BASE_PROPS = {
  element: "div",
  gap: "none",
  align: "stretch",
  justify: "start",
  wrap: "nowrap",
  className: "",
} satisfies Omit<VStackProps, "children">

describe("VStack", () => {
  it("Stack に direction: column を渡して描く（stack-direction-column が付く）", () => {
    render(
      <VStack {...BASE_PROPS}>
        <span data-testid="v-stack-child">child</span>
      </VStack>,
    )

    const child = screen.getByTestId("v-stack-child")
    const parent = child.parentElement
    if (parent === null) {
      throw new Error("VStack が親要素を描いていない")
    }
    expect(parent.className.split(" ")).toContain("stack-direction-column")
    expect(parent.className.split(" ")).not.toContain("stack-direction-row")
  })
})
