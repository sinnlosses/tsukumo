import { cleanup, render, screen } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import {
  useReportOutline,
  type ReportOutlineProps,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-report-outline.ts"
import { PresentationalReportOutline } from "../../../../../../../src/browser/components/page/conversation/components/main-view/presentational-report-outline.tsx"
import { detailBlockClassName } from "../../../../../../../src/browser/features/report/markdown.tsx"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** 列は左の列、本文はメインビューに置くので、本文の器を `contentRef` で結んだ兄弟として描く。 */
function Outline(props: {
  readonly turns: ReportOutlineProps["turns"]
  readonly activeTurnId: number
  readonly children: ReactNode
}): ReactElement {
  const { contentRef, ...model } = useReportOutline({
    turns: props.turns,
    activeTurnId: props.activeTurnId,
    onSelectTurn: () => undefined,
  })
  return (
    <>
      <PresentationalReportOutline {...model} contentRef={contentRef} />
      <div ref={contentRef}>{props.children}</div>
    </>
  )
}

describe("やり取りの列の節の行", () => {
  it("聞いた数を持つ節の行の右に「聞 n」を出し、聞いていない節の行には出さない", () => {
    localStorage.setItem("tsukumo-outline-panel:v1", JSON.stringify({ collapse: "open" }))
    render(
      <Outline
        turns={[
          {
            id: 0,
            title: "架空の依頼",
            result: "done",
            asideCount: 0,
            headedSectionIds: [1, 2],
            report: { kind: "none" },
          },
        ]}
        activeTurnId={0}
      >
        <div className={detailBlockClassName}>
          <div data-report-section="1" data-ask-count="2">
            <h4>架空の聞いた節</h4>
          </div>
          <div data-report-section="2">
            <h4>架空の聞いていない節</h4>
          </div>
        </div>
      </Outline>,
    )

    expect(screen.getAllByText(/^聞 \d+$/).map((node) => node.textContent)).toEqual(["聞 2"])
  })

  it("付箋の数を持つ節の行に「頼 n」を出し、付箋のない節の行には出さない", () => {
    localStorage.setItem("tsukumo-outline-panel:v1", JSON.stringify({ collapse: "open" }))
    render(
      <Outline
        turns={[
          {
            id: 0,
            title: "架空の依頼",
            result: "done",
            asideCount: 0,
            headedSectionIds: [1, 2],
            report: { kind: "none" },
          },
        ]}
        activeTurnId={0}
      >
        <div className={detailBlockClassName}>
          <div data-report-section="1" data-note-count="3">
            <h4>架空の頼んだ節</h4>
          </div>
          <div data-report-section="2">
            <h4>架空の頼んでいない節</h4>
          </div>
        </div>
      </Outline>,
    )

    expect(screen.getAllByText(/^頼 \d+$/).map((node) => node.textContent)).toEqual(["頼 3"])
    expect(screen.getByLabelText("頼みごと 3件")).toBeTruthy()
  })
})

describe("やり取りの列のやり取りの行", () => {
  it("補足メッセージのあるやり取りの行にだけ、2行目の「脇 n」と読み上げの件数を添える", () => {
    render(
      <Outline
        turns={[
          {
            id: 0,
            title: "架空の前の依頼",
            result: "done",
            asideCount: 0,
            headedSectionIds: [],
            report: { kind: "none" },
          },
          {
            id: 1,
            title: "架空の委譲の依頼",
            result: "working",
            asideCount: 2,
            headedSectionIds: [],
            report: { kind: "none" },
          },
        ]}
        activeTurnId={1}
      >
        <p>架空の本文</p>
      </Outline>,
    )

    expect(screen.getByText("脇 2")).toBeTruthy()
    expect(screen.queryByText(/脇 0/)).toBeNull()
    expect(
      screen.getByRole("button", { name: /架空の委譲の依頼（補足メッセージ 2件）/ }).textContent,
    ).toContain("脇 2")
  })
})
