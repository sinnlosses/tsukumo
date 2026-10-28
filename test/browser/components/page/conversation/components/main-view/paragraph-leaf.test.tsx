import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

function paragraph(text: string, extra: { readonly fold?: string; readonly aside?: string } = {}) {
  const fold = extra.fold ?? ""
  const aside = extra.aside ?? ""
  return {
    block: { kind: "text", text, fold, aside } as const,
    part: { id: "p1", component: "Paragraph", text, fold, aside } as const,
  }
}

function bothHtml(text: string, extra: { fold?: string; aside?: string } = {}) {
  const { block, part } = paragraph(text, extra)
  return { fresh: newLeafHtml(block, part), old: oldLeafHtml(block) }
}

describe("Paragraph の部品", () => {
  it("太字・inline code・パス・リンク・色見本・行内の印を含む1文が旧い描画と一致する", () => {
    const { fresh, old } = bothHtml(
      "**架空の太字**と `src/架空.ts:12` と `#ff8800` と [出典](https://example.com/a) と {{12 → 8}} と {{3 / 5}}。",
    )

    expect(fresh).toBe(old)
  })

  it("fold つきは details で包む", () => {
    const { fresh, old } = bothHtml("架空の本文。", { fold: "架空の根拠 {{1 → 2}}" })

    expect(fresh).toContain("<details>")
    expect(fresh).toBe(old)
  })

  it("傍注つき（傍注に inline code）が旧い描画と一致する", () => {
    const { fresh, old } = bothHtml("架空の本文。", { aside: "架空の出典 `a.ts`" })

    expect(fresh).toBe(old)
  })

  it("先頭が塊の記法に見える文字でも、字のまま描く", () => {
    const { fresh, old } = bothHtml("1. 架空の番号のような文")

    expect(fresh).toBe(old)
  })

  it("欄の直接の子として p だけを返す", () => {
    const { part } = paragraph("架空の本文。")
    const view = directLeafViewOf(part)
    const { container } = render(
      <div data-report-region="section">
        {view !== undefined && (
          <DirectLeaf
            part={part}
            imageSource={{ kind: "none" }}
            value={{
              captionNumber: { kind: "none" },
              tagTones: {},
              gutterNotes: [],
              mergedIntoPrevious: false,
              children: [],
            }}
            view={view}
          />
        )}
      </div>,
    )

    expect(
      [...(container.querySelector("[data-report-region]")?.children ?? [])].map(
        (child) => child.tagName,
      ),
    ).toEqual(["P"])
  })
})
