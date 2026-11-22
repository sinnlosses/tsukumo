import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { StatusDot } from "../../../../../src/browser/components/ui/status-dot/status-dot.tsx"

afterEach(() => {
  cleanup()
})

describe("StatusDot", () => {
  it("読み上げの名前が label の画像になる", () => {
    render(<StatusDot tone="accent" label="dummy-status" />)
    expect(screen.getByRole("img", { name: "dummy-status" })).toBeTruthy()
  })
})
