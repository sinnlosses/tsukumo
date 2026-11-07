import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  LeafFold,
  FoldedLeafFrame,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/report-leaf-frame.tsx"
import {
  leafFrameClassNames,
  loadMarkdown,
} from "../../../../../../../src/browser/features/report/markdown.tsx"
import type { LeafValue } from "../../../../../../../src/shared/report/report-leaf-value.ts"

const CAPTION_SELECTOR = `.${leafFrameClassNames.caption}`

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type FrameValue = Pick<LeafValue, "captionNumber" | "gutterNotes">

const NO_CAPTION: FrameValue["captionNumber"] = { kind: "none" }

function frame(value: FrameValue, title: string, fold = "") {
  return render(
    <div data-report-region="section">
      <FoldedLeafFrame value={value} title={title} fit={false} fold={fold} swap={false}>
        <p>架空の本体</p>
      </FoldedLeafFrame>
    </div>,
  )
}

describe("FoldedLeafFrame", () => {
  it("番号も欄外注も無い内容部品は、本体だけを欄の直接の子に返す", () => {
    const { container } = frame({ captionNumber: NO_CAPTION, gutterNotes: [] }, "架空の題")

    const region = container.querySelector("[data-report-region]")
    expect([...(region?.children ?? [])].map((child) => child.tagName)).toEqual(["P"])
  })

  it("図の題は本体の下に、番号をテキストノードで出す", () => {
    const { container } = frame(
      { captionNumber: { kind: "figure", ordinal: 3 }, gutterNotes: [] },
      "架空の題",
    )

    const wrapper = container.querySelector("[data-report-region] > div")
    const caption = wrapper?.querySelector(CAPTION_SELECTOR)
    expect(wrapper?.lastElementChild).toBe(caption)
    expect(caption?.firstElementChild?.firstChild?.nodeType).toBe(Node.TEXT_NODE)
    expect(caption?.textContent).toBe("図 3架空の題")
  })

  it("表の題は本体の上に出し、題の字が空なら番号だけを出す", () => {
    const { container } = frame(
      { captionNumber: { kind: "table", ordinal: 1 }, gutterNotes: [] },
      "",
    )

    const wrapper = container.querySelector("[data-report-region] > div")
    const caption = wrapper?.querySelector(CAPTION_SELECTOR)
    expect(wrapper?.firstElementChild).toBe(caption)
    expect(caption?.children).toHaveLength(1)
    expect(caption?.textContent).toBe("表 1")
  })

  it("欄外注は欄外注の列の外枠に、ラベルと字をテキストとして出し、本体と並べる", () => {
    const { container } = frame(
      {
        captionNumber: NO_CAPTION,
        gutterNotes: [
          { label: "メモ", text: "架空の欄外注" },
          { label: "", text: "ラベルの無い欄外注" },
        ],
      },
      "",
    )

    const outer = container.querySelector("[data-report-region] > div")
    const gutter = outer?.querySelector(`.${leafFrameClassNames.gutter}`)
    expect(outer?.firstElementChild?.tagName).toBe("P")
    expect(gutter?.parentElement).toBe(outer)
    expect([...(gutter?.querySelectorAll("aside") ?? [])].map((note) => note.textContent)).toEqual([
      "メモ架空の欄外注",
      "ラベルの無い欄外注",
    ])
  })

  it("欄外注の字の inline code は code 要素で描く", () => {
    const { container } = frame(
      { captionNumber: NO_CAPTION, gutterNotes: [{ label: "", text: "架空の欄外注 `a.ts`" }] },
      "",
    )

    expect(container.querySelector("aside code")?.textContent).toBe("a.ts")
  })

  it("題の字の inline code は code 要素で描く", () => {
    const { container } = frame(
      { captionNumber: { kind: "figure", ordinal: 1 }, gutterNotes: [] },
      "架空の `a.ts` の題",
    )

    expect(container.querySelector(`${CAPTION_SELECTOR} code`)?.textContent).toBe("a.ts")
  })

  it("fold があれば題つきの外枠を details で畳み、欄外注の列は details の外に置く", () => {
    const { container } = frame(
      {
        captionNumber: { kind: "table", ordinal: 1 },
        gutterNotes: [{ label: "", text: "架空の欄外注" }],
      },
      "架空の題",
      "架空の畳み",
    )

    const outer = container.querySelector("[data-report-region] > div")
    const details = outer?.firstElementChild
    expect(details?.tagName).toBe("DETAILS")
    expect(details?.querySelector("summary")?.textContent).toBe("架空の畳み")
    expect(details?.querySelector(CAPTION_SELECTOR)).not.toBeNull()
    expect(outer?.lastElementChild?.classList.contains(leafFrameClassNames.gutter)).toBe(true)
  })

  it("題と欄外注の両方があれば、題つきの外枠を欄外注の外枠が外から囲む", () => {
    const { container } = frame(
      {
        captionNumber: { kind: "figure", ordinal: 2 },
        gutterNotes: [{ label: "", text: "架空の欄外注" }],
      },
      "架空の題",
    )

    const outer = container.querySelector("[data-report-region] > div")
    expect(outer?.children).toHaveLength(2)
    expect(outer?.firstElementChild?.querySelector(CAPTION_SELECTOR)).not.toBeNull()
    expect(outer?.lastElementChild?.classList.contains(leafFrameClassNames.gutter)).toBe(true)
  })
})

describe("LeafFold", () => {
  function fold(props: { readonly fold: string; readonly empty: boolean }) {
    return render(
      <div data-report-region="section">
        <LeafFold fold={props.fold} empty={props.empty}>
          <p>架空の本体</p>
        </LeafFold>
      </div>,
    )
  }

  it("fold が空なら本体をそのまま返す", () => {
    const { container } = fold({ fold: " ", empty: false })

    expect(
      [...(container.querySelector("[data-report-region]")?.children ?? [])].map(
        (child) => child.tagName,
      ),
    ).toEqual(["P"])
  })

  it("本体が空なら畳まない", () => {
    const { container } = fold({ fold: "架空の題", empty: true })

    expect(container.querySelector("details")).toBeNull()
  })

  it("fold があれば details で包み、summary の字は行内の印を素の字に畳む", () => {
    const { container } = fold({ fold: "架空の根拠 {{1 → 2}}", empty: false })

    expect(container.querySelector("details > summary")?.textContent).toBe("架空の根拠 1 → 2")
    expect(container.querySelector("details > p")).not.toBeNull()
  })
})
