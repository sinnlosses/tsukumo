import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ReportOutline } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report-outline/report-outline.tsx"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("ReportOutline のやり取りの行", () => {
  it("脇の話のあるやり取りの行にだけ、2行目の「脇 n」と読み上げの件数を添える", () => {
    // 札の幅を測れない環境では列が既定で畳まれるので、開く選択を保存しておく。
    localStorage.setItem("tsukumo-outline-panel:v1", JSON.stringify({ collapse: "open" }))
    render(
      <ReportOutline
        turns={[
          { id: 0, title: "架空の前の依頼", result: "done", asideCount: 0 },
          { id: 1, title: "架空の委譲の依頼", result: "working", asideCount: 2 },
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
      screen.getByRole("button", { name: /架空の委譲の依頼（脇の話 2件）/ }).textContent,
    ).toContain("脇 2")
  })
})
