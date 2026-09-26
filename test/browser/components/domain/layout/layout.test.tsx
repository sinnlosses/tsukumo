import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, screen } from "@testing-library/react"

import { Layout } from "../../../../../src/browser/components/domain/layout/layout.tsx"

afterEach(() => {
  cleanup()
})

describe("Layout", () => {
  it("nav を先に、screen をその下に並べて描く", () => {
    render(<Layout nav={<div>nav</div>} screen={<div>screen</div>} />)

    const nodes = screen.getAllByText(/^(nav|screen)$/)
    expect(nodes.map((node) => node.textContent)).toEqual(["nav", "screen"])
  })
})
