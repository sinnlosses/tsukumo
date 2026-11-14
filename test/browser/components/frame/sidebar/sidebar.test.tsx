import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Sidebar } from "../../../../../src/browser/components/frame/sidebar/sidebar.tsx"

afterEach(cleanup)

describe("サイドバーの枠", () => {
  it("検索の入口・中段・下の入口の行を、上からこの順に並べる", () => {
    const { container } = render(
      <Sidebar
        search={<span data-testid="search">検索</span>}
        body={<span data-testid="body">中段</span>}
        foot={<span data-testid="foot">入口</span>}
      />,
    )

    const side = container.querySelector('[data-region="sidebar"]')
    const order = [...(side?.querySelectorAll("[data-testid]") ?? [])].map((node) =>
      node.getAttribute("data-testid"),
    )
    expect(order).toEqual(["search", "body", "foot"])
  })
})
