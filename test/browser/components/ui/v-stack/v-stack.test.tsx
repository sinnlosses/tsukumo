import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import {
  VStack,
  type VStackProps,
} from "../../../../../src/browser/components/ui/v-stack/v-stack.tsx"

afterEach(() => {
  cleanup()
})

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

  it("direction 以外の props（gap・align・className など）をそのまま Stack へ渡す", () => {
    render(
      <VStack {...BASE_PROPS} gap="lg" align="center" className="dummy-extra">
        <span data-testid="v-stack-child">child</span>
      </VStack>,
    )

    const child = screen.getByTestId("v-stack-child")
    const parent = child.parentElement
    if (parent === null) {
      throw new Error("VStack が親要素を描いていない")
    }
    expect(parent.className.split(" ")).toEqual(
      expect.arrayContaining(["stack-gap-lg", "stack-align-center", "dummy-extra"]),
    )
  })
})
