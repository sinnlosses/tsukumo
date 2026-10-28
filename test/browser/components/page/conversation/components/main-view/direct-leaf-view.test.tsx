import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  DirectLeaf,
  directLeafViewOf,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../../src/shared/report/report-leaf-value.ts"

afterEach(() => {
  cleanup()
})

const PART: A2uiReportComponent = {
  id: "p1",
  component: "Paragraph",
  text: "架空の段落",
  fold: "",
  aside: "",
}

const VALUE: LeafValue = {
  captionNumber: { kind: "none" },
  tagTones: {},
  gutterNotes: [],
  mergedIntoPrevious: false,
  children: [],
}

describe("directLeafViewOf", () => {
  it("同梱の一覧は Paragraph を持ち、一覧に無い葉は Markdown の描画に通す", () => {
    expect(directLeafViewOf(PART)).toBeDefined()
    expect(
      directLeafViewOf({ id: "m1", component: "Markdown", markdown: "", fold: "", aside: "" }),
    ).toBeUndefined()
  })

  it("一覧にある部品名なら、その部品を返す", () => {
    const view = () => <p>直接</p>

    expect(directLeafViewOf(PART, new Map([["Paragraph", view]]))).toBe(view)
    expect(directLeafViewOf(PART, new Map([["Note", view]]))).toBeUndefined()
  })
})

describe("DirectLeaf", () => {
  it("値を渡して部品を描く", () => {
    const { container } = render(
      <DirectLeaf part={PART} value={VALUE} view={(props) => <p>{props.part.id}</p>} />,
    )

    expect(container.textContent).toBe("p1")
  })

  it("整形で落ちた葉（値が無い）は何も描かない", () => {
    const { container } = render(
      <DirectLeaf part={PART} value={undefined} view={() => <p>直接</p>} />,
    )

    expect(container.textContent).toBe("")
  })
})
