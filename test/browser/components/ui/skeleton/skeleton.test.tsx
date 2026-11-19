import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Skeleton } from "../../../../../src/browser/components/ui/skeleton/skeleton.tsx"

afterEach(() => {
  cleanup()
})

describe("Skeleton", () => {
  it("読み上げに出さない塊を描く", () => {
    const { container } = render(<Skeleton className="">中身</Skeleton>)
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true")
  })
})
