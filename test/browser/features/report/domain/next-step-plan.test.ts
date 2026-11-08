import { describe, expect, it } from "vitest"

import { buildNextSteps } from "../../../../../src/browser/features/report/domain/next-step-plan.ts"
import type { A2uiReportComponent } from "../../../../../src/shared/report/a2ui-report-catalog.ts"

const options: A2uiReportComponent = {
  id: "options-1",
  component: "Options",
  title: "架空の比べ",
  items: [
    { name: "架空の案A", verdict: "adopt", reason: "理由" },
    { name: "架空の案B", verdict: "consider", reason: "理由" },
    { name: "架空の案C", verdict: "reject", reason: "理由" },
  ],
  fold: "",
  aside: "",
}

const claim = (certainty: "confirmed" | "inferred" | "unverified", howToVerify: string) => ({
  claim: `架空の主張 ${certainty}`,
  certainty,
  basis: "",
  howToVerify,
})

const claims = (items: ReturnType<typeof claim>[]): A2uiReportComponent => ({
  id: "claims-1",
  component: "Claims",
  items,
  fold: "",
  aside: "",
})

const none = { kind: "none" } as const

describe("buildNextSteps", () => {
  it("4つの種類が 再開する → 続ける → 確かめる → 別の案で進める の順に出る", () => {
    const steps = buildNextSteps({
      components: [options, claims([claim("inferred", "架空の手順")])],
      sessionRemaining: { kind: "remaining", text: "架空の残り" },
      outcome: "stopped",
    })

    expect(steps.map((step) => step.kind)).toEqual(["resume", "continue", "verify", "alternative"])
    expect(steps[0]).toMatchObject({ draft: "止めたところから再開して。" })
    expect(steps[1]).toMatchObject({
      label: "続ける: 架空の残り",
      draft: "続けて。架空の残り",
    })
    expect(steps[3]).toMatchObject({
      alternatives: [
        { name: "架空の案B", draft: "架空の案B で進めて。" },
        { name: "架空の案C", draft: "架空の案C で進めて。" },
      ],
    })
  })

  it("元の欄が無い種類は出さず、1つも無ければ空になる", () => {
    expect(buildNextSteps({ components: [], sessionRemaining: none, outcome: "finished" })).toEqual(
      [],
    )
    expect(
      buildNextSteps({
        components: [claims([claim("confirmed", "")])],
        sessionRemaining: { kind: "unrecorded" },
      }),
    ).toEqual([])
  })

  it("sessionRemaining が無ければ Options の採った案の題で続ける", () => {
    const steps = buildNextSteps({ components: [options], sessionRemaining: none })

    expect(steps[0]).toMatchObject({ kind: "continue", label: "続ける: 架空の案A" })
  })

  it("推測と未確認が混じれば件数だけ、howToVerify の無い主張は確かめ方の行を持たない", () => {
    const [step] = buildNextSteps({
      components: [claims([claim("inferred", "架空の手順"), claim("unverified", "")])],
      sessionRemaining: none,
    })

    expect(step).toEqual({
      kind: "verify",
      label: "確かめる: 2 件",
      draft: [
        "確かめて。",
        "1. 架空の主張 inferred",
        "   確かめ方: 架空の手順",
        "2. 架空の主張 unverified",
      ].join("\n"),
    })
  })

  it("未確認だけなら未確認 n 件、推測だけなら推測 n 件", () => {
    const labelOf = (certainty: "inferred" | "unverified") =>
      buildNextSteps({
        components: [claims([claim(certainty, "手順")])],
        sessionRemaining: none,
      })[0]?.label

    expect(labelOf("unverified")).toBe("確かめる: 未確認 1 件")
    expect(labelOf("inferred")).toBe("確かめる: 推測 1 件")
  })
})
