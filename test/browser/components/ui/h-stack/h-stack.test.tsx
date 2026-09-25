import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import {
  HStack,
  type HStackProps,
} from "../../../../../src/browser/components/ui/h-stack/h-stack.tsx"

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

  it("direction 以外の props（gap・align・className など）をそのまま Stack へ渡す", () => {
    render(
      <HStack {...BASE_PROPS} gap="sm" justify="between" className="dummy-extra">
        <span data-testid="h-stack-child">child</span>
      </HStack>,
    )

    const child = screen.getByTestId("h-stack-child")
    const parent = child.parentElement
    if (parent === null) {
      throw new Error("HStack が親要素を描いていない")
    }
    expect(parent.className.split(" ")).toEqual(
      expect.arrayContaining(["stack-gap-sm", "stack-justify-between", "dummy-extra"]),
    )
  })
})
