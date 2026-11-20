import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { CitationTable } from "../../../../../src/browser/features/report/domain/citation-number.ts"
import {
  InlineMarkdown,
  Markdown,
} from "../../../../../src/browser/features/report/renderer/markdown-renderer.tsx"
import { foldInlineMarks } from "../../../../../src/shared/report/inline-mark.ts"

afterEach(() => {
  cleanup()
})

const SENTENCE = "前は {{12 → 8}} 秒、推移 {{spark: 3 5 4 8}}、達成 {{3 / 5}} 件。"

const kindsIn = (container: HTMLElement) => ({
  diff: container.querySelectorAll('[class*="report-mark-diff"]').length > 0,
  spark: container.querySelectorAll('[class*="report-mark-spark"]').length > 0,
  ratio: container.querySelectorAll('[class*="report-mark-ratio"]').length > 0,
})

describe("rehypeInlineMark（Markdown を通した描画）", () => {
  it.each([
    ["地の文", SENTENCE],
    ["表のセル", `| a | b |\n| --- | --- |\n| x | ${SENTENCE} |`],
    ["箇条書きの項目", `- ${SENTENCE}`],
    ["結論の包み", `<div class="conclusion">\n\n${SENTENCE}\n\n</div>`],
  ])("%s で 3 種が span になり、文字は畳んだ素の文字と一致する", (_, text) => {
    const { container } = render(<Markdown text={text} />)

    expect(kindsIn(container)).toEqual({ diff: true, spark: true, ratio: true })
    expect(container.textContent).toContain(foldInlineMarks(SENTENCE))
  })

  it("帯の幅は a/b の割合になる", () => {
    const { container } = render(<Markdown text="達成 {{3 / 5}} 件" />)

    expect(
      container.querySelector('[class*="report-mark-ratio-fill"]')?.getAttribute("style"),
    ).toBe("width: 60%;")
  })

  it("壊れた印と inline code の中は字のままで、印の span にならない", () => {
    const { container } = render(<Markdown text={"`{{3 / 5}}` と {{3 / 5 と {{x}} と {{5 / 3}}"} />)

    expect(kindsIn(container)).toEqual({ diff: false, spark: false, ratio: false })
    expect(container.textContent).toBe("{{3 / 5}} と {{3 / 5 と {{x}} と {{5 / 3}}")
    expect(container.querySelector("code")?.textContent).toBe("{{3 / 5}}")
  })
})

describe("rehypeInlineMark の出典の番号札", () => {
  const entry = (number: number, id: string) => ({
    number,
    title: `架空の出典${String(number)}`,
    host: "example.com",
    url: `https://example.com/${id}`,
    rowId: `report-source-1-${id}`,
  })
  const citations: CitationTable = new Map([
    ["s1", entry(1, "s1")],
    ["s2", entry(2, "s2")],
  ])
  const badges = (container: HTMLElement) =>
    [...container.querySelectorAll('a[class*="report-mark-cite-badge"]')].map((badge) => ({
      text: badge.textContent,
      href: badge.getAttribute("href"),
      describedBy: badge.getAttribute("aria-describedby"),
    }))

  it("表があれば番号のバッジ・一覧の行への行き先・題とホスト名の札が出て、同じ id は同じ番号", () => {
    const { container } = render(
      <InlineMarkdown text="架空{{cite: s2 s1}}と{{cite: s2}}。" citations={citations} />,
    )

    expect(badges(container)).toEqual([
      { text: "2", href: "#report-source-1-s2", describedBy: "report-source-1-s2" },
      { text: "1", href: "#report-source-1-s1", describedBy: "report-source-1-s1" },
      { text: "2", href: "#report-source-1-s2", describedBy: "report-source-1-s2" },
    ])
    const card = container.querySelector('[role="tooltip"]')
    expect(card?.textContent).toBe("架空の出典2example.com")
  })

  it("表に無い id は控えめな「…」で、行き先を持たない", () => {
    const { container } = render(<InlineMarkdown text="架空{{cite: s9}}。" citations={citations} />)

    expect(badges(container)).toEqual([])
    expect(container.querySelector('[class*="report-mark-cite-pending"]')?.textContent).toBe("…")
  })

  it("表が無いとき（レポートの外）は何も出さず、畳んだ素の文字と同じ", () => {
    const { container } = render(<InlineMarkdown text="架空{{cite: s1}}。" />)

    expect(container.querySelector('[class*="report-mark-cite"]')).toBeNull()
    expect(container.textContent).toBe(foldInlineMarks("架空{{cite: s1}}。"))
  })
})
