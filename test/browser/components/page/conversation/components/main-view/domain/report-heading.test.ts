import { describe, expect, it } from "vitest"

import {
  readableHeadings,
  readableOutlineItems,
  REPORT_DRAFT_ATTRIBUTE,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/report-heading.ts"
import { detailBlockClassName } from "../../../../../../../../src/browser/features/report/markdown.tsx"

function sectionWith(heading: string, attribute?: string): HTMLElement {
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

describe("readableOutlineItems の段", () => {
  function regionWith(...headings: readonly string[]): HTMLElement {
    const block = document.createElement("div")
    block.className = detailBlockClassName
    const region = document.createElement("div")
    region.setAttribute("data-report-section", "1")
    for (const text of headings) {
      const h4 = document.createElement("h4")
      h4.textContent = text
      region.append(h4)
    }
    block.append(region)
    return block
  }

  it("見出しのある節の欄の最初の h4 だけが節の行で、節の中の2つ目の見出しは sub", () => {
    const content = document.createElement("div")
    content.append(regionWith("架空の節", "架空の余分な見出し"))
    const other = regionWith("架空の別の節")
    other.firstElementChild?.setAttribute("data-report-section", "2")
    content.append(other)

    expect(readableOutlineItems(content, [1, 2]).map((item) => [item.level, item.text])).toEqual([
      ["section", "架空の節"],
      ["sub", "架空の余分な見出し"],
      ["section", "架空の別の節"],
    ])
  })
})

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

  it("hidden の中の見出しは拾わない", () => {
    const content = document.createElement("div")
    content.append(
      sectionWith("架空の確定した見出し", undefined),
      sectionWith("架空の隠した見出し", "hidden"),
    )

    expect(readableHeadings(content).map((heading) => heading.textContent)).toEqual([
      "架空の確定した見出し",
    ])
  })
})
