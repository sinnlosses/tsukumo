import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ReportHead } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report-head/report-head.tsx"
import type { MainViewPhaseLabel } from "../../../../../../../../../src/shared/session/main-view.ts"

afterEach(cleanup)

function catalog(phase: MainViewPhaseLabel): string {
  const { container } = render(
    <ReportHead
      label="interim"
      task={{ kind: "none" }}
      phase={phase}
      changeSummary={{ kind: "none" }}
      className=""
    />,
  )
  return container.querySelector("p")?.textContent ?? ""
}

describe("ReportHead の終えた段", () => {
  it("済んだ段は見出しと所要だけを出す", () => {
    expect(
      catalog({
        kind: "phase",
        label: "1/3 架空の段A",
        duration: { kind: "known", milliseconds: 12_000 },
        skipped: false,
      }),
    ).toBe("中間レポート·1/3 架空の段A·所要 12秒")
  })

  it("飛ばした段は所要の前に「飛ばした」を添え、所要は残す", () => {
    expect(
      catalog({
        kind: "phase",
        label: "1/3 架空の段A",
        duration: { kind: "known", milliseconds: 0 },
        skipped: true,
      }),
    ).toBe("中間レポート·1/3 架空の段A·飛ばした·所要 0秒")
  })
})
