import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import type { LeafValue } from "../../../../../../../src/shared/report/report-leaf-value.ts"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const VALUE: LeafValue = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
}

function drawn(extra: {
  readonly items?: { term: string; description: string }[]
  readonly fold?: string
  readonly value?: LeafValue
}) {
  const part = {
    id: "d1",
    component: "DescriptionList",
    items: extra.items ?? [{ term: "架空の上限", description: "60" }],
    fold: extra.fold ?? "",
    aside: "",
  } as const
  const view = directLeafViewOf(part)
  return render(
    <div data-report-region="section">
      {view !== undefined && (
        <DirectLeaf
          part={part}
          imageSource={{ kind: "none" }}
          value={extra.value ?? VALUE}
          view={view}
        />
      )}
    </div>,
  ).container
}

describe("DescriptionList の部品", () => {
  it("名前と値が dl の dt と dd に、対の数だけ並ぶ", () => {
    const container = drawn({
      items: [
        { term: "架空の上限", description: "60" },
        { term: "読み込む場所", description: "架空の値" },
      ],
    })

    expect([...container.querySelectorAll("dl dt")].map((term) => term.textContent)).toEqual([
      "架空の上限",
      "読み込む場所",
    ])
    expect([...container.querySelectorAll("dl dd")].map((value) => value.textContent)).toEqual([
      "60",
      "架空の値",
    ])
  })

  it("名前と値のインラインの記法（inline code・太字・リンク）が要素になる", () => {
    const container = drawn({
      items: [
        {
          term: "`a.ts`",
          description: "**太字** と [出典](https://example.com/a)",
        },
      ],
    })

    expect(container.querySelector("dt code")?.textContent).toBe("a.ts")
    expect(container.querySelector("dd strong")?.textContent).toBe("太字")
    expect(container.querySelector("dd a")?.getAttribute("href")).toBe("https://example.com/a")
  })

  it("fold があれば details で畳む", () => {
    const container = drawn({ fold: "架空の根拠" })

    expect(container.querySelector("details > summary")?.textContent).toBe("架空の根拠")
    expect(container.querySelector("details dl dt")?.textContent).toBe("架空の上限")
  })

  it("欄外注があれば欄外注の列に欄外注が付く", () => {
    const container = drawn({
      value: { ...VALUE, gutterNotes: [{ label: "", text: "架空の欄外注" }] },
    })

    expect(container.querySelector("aside")?.textContent).toBe("架空の欄外注")
  })
})
