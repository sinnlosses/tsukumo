import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ReportOutline } from "../../../../../../../src/browser/components/page/conversation/components/main-view/report-outline.tsx"
import { detailBlockClassName } from "../../../../../../../src/browser/features/report/markdown.tsx"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("ReportOutline の節の行", () => {
  it("聞いた数を持つ節の行の右に「聞 n」を出し、聞いていない節の行には出さない", () => {
    localStorage.setItem("tsukumo-outline-panel:v1", JSON.stringify({ collapse: "open" }))
    render(
      <ReportOutline
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
        onSelectTurn={() => undefined}
        notice={{ kind: "none" }}
        onNotice={() => undefined}
      >
        <div className={detailBlockClassName}>
          <div data-report-section="1" data-ask-count="2">
            <h4>架空の聞いた節</h4>
          </div>
          <div data-report-section="2">
            <h4>架空の聞いていない節</h4>
          </div>
        </div>
      </ReportOutline>,
    )

    expect(screen.getAllByText(/^聞 \d+$/).map((node) => node.textContent)).toEqual(["聞 2"])
  })
})

describe("ReportOutline のやり取りの行", () => {
  it("補足メッセージのあるやり取りの行にだけ、2行目の「脇 n」と読み上げの件数を添える", () => {
    // 札の幅を測れない環境では列が既定で畳まれるので、開く選択を保存しておく。
    localStorage.setItem("tsukumo-outline-panel:v1", JSON.stringify({ collapse: "open" }))
    render(
      <ReportOutline
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
        onSelectTurn={() => undefined}
        notice={{ kind: "none" }}
        onNotice={() => undefined}
      >
        <p>架空の本文</p>
      </ReportOutline>,
    )

    expect(screen.getByText("脇 2")).toBeTruthy()
    expect(screen.queryByText(/脇 0/)).toBeNull()
    expect(
      screen.getByRole("button", { name: /架空の委譲の依頼（補足メッセージ 2件）/ }).textContent,
    ).toContain("脇 2")
  })
})
