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
  readonly text?: string
  readonly source?: string
  readonly fold?: string
  readonly value?: LeafValue
}) {
  const part = {
    id: "q1",
    component: "Quote",
    text: extra.text ?? "架空の引用",
    source: extra.source ?? "",
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

describe("Quote の部品", () => {
  it("文のインラインの記法（inline code・太字・リンク）が要素になる", () => {
    const container = drawn({ text: "架空の `a.ts` と **太字** と [出典](https://example.com/a)" })

    expect(container.querySelector("p code")?.textContent).toBe("a.ts")
    expect(container.querySelector("p strong")?.textContent).toBe("太字")
    expect(container.querySelector("p a")?.getAttribute("href")).toBe("https://example.com/a")
  })

  it("出典があれば 2 つ目の段落に「—」つきで出て、無ければ出ない", () => {
    const withSource = [...drawn({ source: "架空の出典" }).querySelectorAll("p")]
    cleanup()
    const without = [...drawn({}).querySelectorAll("p")]

    expect(withSource.map((paragraph) => paragraph.textContent)).toEqual([
      "架空の引用",
      "— 架空の出典",
    ])
    expect(without.map((paragraph) => paragraph.textContent)).toEqual(["架空の引用"])
  })

  it("文が空白だけなら何も描かない", () => {
    expect(drawn({ text: "  ", source: "架空の出典" }).querySelector("p")).toBeNull()
  })

  it("fold があれば details で畳む", () => {
    const container = drawn({ fold: "架空の根拠" })

    expect(container.querySelector("details > summary")?.textContent).toBe("架空の根拠")
    expect(container.querySelector("details p")?.textContent).toBe("架空の引用")
  })

  it("傍注があれば柱の傍注が付く", () => {
    const container = drawn({
      value: { ...VALUE, gutterNotes: [{ label: "", text: "架空の傍注" }] },
    })

    expect(container.querySelector("aside")?.textContent).toBe("架空の傍注")
  })
})
