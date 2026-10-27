import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Markdown } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/markdown-renderer.tsx"
import { foldInlineMarks } from "../../../../../../../../src/shared/report/inline-mark.ts"

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
