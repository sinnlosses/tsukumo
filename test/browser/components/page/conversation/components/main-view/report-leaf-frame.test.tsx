import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  ReportLeafFrame,
  ReportPausePoint,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/report-leaf-frame.tsx"
import type { LeafValue } from "../../../../../../../src/shared/report/report-leaf-value.ts"

afterEach(() => {
  cleanup()
})

type FrameValue = Pick<LeafValue, "captionNumber" | "gutterNotes">

const NO_CAPTION: FrameValue["captionNumber"] = { kind: "none" }

function frame(value: FrameValue, title: string) {
  return render(
    <div data-report-region="section">
      <ReportLeafFrame value={value} title={title} fit={false}>
        <p>架空の本体</p>
      </ReportLeafFrame>
    </div>,
  )
}

describe("ReportLeafFrame", () => {
  it("番号も傍注も無い葉は、本体だけを欄の直接の子に返す", () => {
    const { container } = frame({ captionNumber: NO_CAPTION, gutterNotes: [] }, "架空の題")

    const region = container.querySelector("[data-report-region]")
    expect([...(region?.children ?? [])].map((child) => child.tagName)).toEqual(["P"])
  })

  it("図の題は本体の下に、番号をテキストノードで出し、題の印を付ける", () => {
    const { container } = frame(
      { captionNumber: { kind: "figure", ordinal: 3 }, gutterNotes: [] },
      "架空の題",
    )

    const wrapper = container.querySelector("[data-report-region] > div")
    const caption = wrapper?.querySelector("[data-reveal-caption]")
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
    const caption = wrapper?.querySelector("[data-reveal-caption]")
    expect(wrapper?.firstElementChild).toBe(caption)
    expect(caption?.children).toHaveLength(1)
    expect(caption?.textContent).toBe("表 1")
  })

  it("傍注は柱の印を付けた包みに、ラベルと字をテキストとして出し、本体と並べる", () => {
    const { container } = frame(
      {
        captionNumber: NO_CAPTION,
        gutterNotes: [
          { label: "メモ", text: "架空の傍注" },
          { label: "", text: "ラベルの無い傍注" },
        ],
      },
      "",
    )

    const outer = container.querySelector("[data-report-region] > div")
    const gutter = outer?.querySelector("[data-reveal-gutter]")
    expect(outer?.firstElementChild?.tagName).toBe("P")
    expect(gutter?.parentElement).toBe(outer)
    expect([...(gutter?.querySelectorAll("aside") ?? [])].map((note) => note.textContent)).toEqual([
      "メモ架空の傍注",
      "ラベルの無い傍注",
    ])
  })

  it("題と傍注の両方があれば、題つきの包みを傍注の包みが外から囲む", () => {
    const { container } = frame(
      {
        captionNumber: { kind: "figure", ordinal: 2 },
        gutterNotes: [{ label: "", text: "架空の傍注" }],
      },
      "架空の題",
    )

    const outer = container.querySelector("[data-report-region] > div")
    expect(outer?.children).toHaveLength(2)
    expect(outer?.firstElementChild?.querySelector("[data-reveal-caption]")).not.toBeNull()
    expect(outer?.lastElementChild?.hasAttribute("data-reveal-gutter")).toBe(true)
  })
})

describe("ReportPausePoint", () => {
  it("葉の class に筆を留める印を足した要素を、欄の直接の子に返す", () => {
    const { container } = render(
      <div data-report-region="section">
        <ReportPausePoint className="note-class">本文</ReportPausePoint>
      </div>,
    )

    const point = container.querySelector("[data-report-region] > div")
    expect(point?.matches(".note-class.report-pause-point")).toBe(true)
  })
})
