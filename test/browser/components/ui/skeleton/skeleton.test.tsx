import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Skeleton } from "../../../../../src/browser/components/ui/skeleton/skeleton.tsx"

afterEach(() => {
  cleanup()
})

describe("Skeleton", () => {
  it("読み上げに出さない塊を描き、className・style・中身を渡す", () => {
    const { container } = render(
      <Skeleton className="caller" style={{ width: "50%" }}>
        中身
      </Skeleton>,
    )
    const block = container.firstElementChild
    expect(block?.getAttribute("aria-hidden")).toBe("true")
    expect(block?.classList.contains("caller")).toBe(true)
    expect(block?.getAttribute("style")).toContain("width: 50%")
    expect(block?.textContent).toBe("中身")
  })
})
