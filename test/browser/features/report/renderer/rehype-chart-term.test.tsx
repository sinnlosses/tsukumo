import { cleanup, render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"

import { chartTermLinksOf } from "../../../../../src/browser/features/report/domain/chart-term-link.ts"
import { InlineMarkdown } from "../../../../../src/browser/features/report/renderer/markdown-renderer.tsx"

afterEach(() => {
  cleanup()
})

const TERMS = chartTermLinksOf([{ id: "c1", labels: ["架空1月", "架空2月"] }])

describe("rehypeChartTerm（InlineMarkdown を通した描画）", () => {
  it("語が印の span で包まれ、図と位置を持つ", () => {
    const { container } = render(
      <InlineMarkdown text="架空 1月は多く架空2月は少ない。" chartTerms={TERMS} />,
    )
    const marks = [...container.querySelectorAll("[data-chart-term]")]

    expect(marks.map((mark) => mark.textContent)).toEqual(["架空 1月", "架空2月"])
    expect(marks.map((mark) => mark.getAttribute("data-chart-index"))).toEqual(["0", "1"])
    expect(marks[0]?.getAttribute("data-chart-id")).toBe("c1")
    expect(marks[0]?.getAttribute("tabindex")).toBe("0")
    expect(container.textContent).toBe("架空 1月は多く架空2月は少ない。")
  })

  it("inline code とリンクの中は包まない", () => {
    const { container } = render(
      <InlineMarkdown text="`架空1月` と [架空2月](https://example.com)" chartTerms={TERMS} />,
    )

    expect(container.querySelectorAll("[data-chart-term]")).toHaveLength(0)
  })

  it("chartTerms が無い描画は、語を含んでいても印を足さない", () => {
    const text = "架空1月は多い。"
    const withoutTerms = renderToStaticMarkup(<InlineMarkdown text={text} />)
    const withEmpty = renderToStaticMarkup(<InlineMarkdown text={text} chartTerms={new Map()} />)

    expect(withoutTerms).not.toContain("data-chart-term")
    expect(withEmpty).toBe(withoutTerms)
  })
})
