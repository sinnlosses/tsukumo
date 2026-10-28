import { describe, expect, it } from "vitest"

import {
  readableHeadings,
  REPORT_DRAFT_ATTRIBUTE,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/report-heading.ts"
import { detailBlockClassName } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"

function sectionWith(heading: string, attribute: string | undefined): HTMLElement {
  const section = document.createElement("section")
  if (attribute !== undefined) {
    section.setAttribute(attribute, "")
  }
  const block = document.createElement("div")
  block.className = detailBlockClassName
  const h4 = document.createElement("h4")
  h4.textContent = heading
  block.append(h4)
  section.append(block)
  return section
}

describe("readableHeadings", () => {
  it("草稿の面の中の見出しは拾わない", () => {
    const content = document.createElement("div")
    content.append(
      sectionWith("架空の確定した見出し", undefined),
      sectionWith("架空の草稿の見出し", REPORT_DRAFT_ATTRIBUTE),
    )

    expect(readableHeadings(content).map((heading) => heading.textContent)).toEqual([
      "架空の確定した見出し",
    ])
  })
})
