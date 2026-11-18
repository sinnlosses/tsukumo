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
  it("続きの依頼の文（request）があれば「続ける」の下書きになり、無ければ「続きを進めて。」", () => {
    const draftOf = (request?: string) =>
      buildNextSteps({
        unobserved: [],
        components: [],
        sessionRemaining: {
          kind: "remaining",
          text: "架空の残り",
          ...(request === undefined ? {} : { request }),
        },
        outcome: "finished",
      }).find((step) => step.kind === "continue")

    expect(draftOf("  架空の手順を書いて。 ")).toMatchObject({ draft: "架空の手順を書いて。" })
    expect(draftOf()).toMatchObject({ draft: "続きを進めて。" })
  })

  it("4つの種類が 再開する → 続ける → 確かめる → 別の案で進める の順に出る", () => {
    const steps = buildNextSteps({
      unobserved: [],
      components: [options, claims([claim("inferred", "架空の手順")])],
      sessionRemaining: { kind: "remaining", text: "架空の残り" },
      outcome: "stopped",
    })

    expect(steps.map((step) => step.kind)).toEqual(["resume", "continue", "verify", "alternative"])
    expect(steps[0]).toMatchObject({ draft: "止めたところから再開して。" })
    expect(steps[1]).toMatchObject({
      kindLabel: "続ける",
      label: "続きを進めて。",
      note: "架空の残り",
      draft: "続きを進めて。",
    })
    expect(steps[3]).toMatchObject({
      alternatives: [
        { name: "架空の案B", draft: "「架空の案B」で進めて。" },
        { name: "架空の案C", draft: "「架空の案C」で進めて。" },
      ],
    })
  })

  it("どの札も、主の字が押すと入る文の1行目と一致する", () => {
    const steps = buildNextSteps({
      unobserved: [],
      components: [options, claims([claim("inferred", "架空の手順")])],
      sessionRemaining: { kind: "remaining", text: "架空の残り" },
      outcome: "stopped",
    })

    for (const step of steps) {
      if (step.kind !== "alternative" && step.kind !== "check-result") {
        expect(step.label).toBe(step.draft.split("\n")[0])
      }
    }
  })

  it("元の欄が無い種類は出さず、1つも無ければ空になる", () => {
    expect(
      buildNextSteps({
        unobserved: [],
        components: [],
        sessionRemaining: none,
        outcome: "finished",
      }),
    ).toEqual([])
    expect(
      buildNextSteps({
        unobserved: [],
        components: [claims([claim("confirmed", "")])],
        sessionRemaining: { kind: "unrecorded" },
      }),
    ).toEqual([])
  })

  it("sessionRemaining が無ければ Options の採った案の題で続ける", () => {
    const steps = buildNextSteps({ unobserved: [], components: [options], sessionRemaining: none })

    expect(steps[0]).toMatchObject({
      kind: "continue",
      kindLabel: "続ける",
      label: "「架空の案A」で進めて。",
      draft: "「架空の案A」で進めて。",
    })
  })

  it("お願いの選択肢があるレポートには「続ける」を足さない", () => {
    const root: A2uiReportComponent = {
      id: "root",
      component: "Report",
      children: ["options-1"],
      favor: "架空のお願い",
      favorOptions: [{ name: "架空の選択肢", draft: "架空の選択肢で進めて" }],
    }
    const steps = buildNextSteps({
      unobserved: [],
      components: [root, options],
      sessionRemaining: { kind: "remaining", text: "架空の残り" },
    })

    expect(steps.map((step) => step.kind)).toEqual(["alternative"])
  })

  it("推測と未確認が混じれば件数だけ、howToVerify の無い主張は確かめ方の行を持たない", () => {
    const [step] = buildNextSteps({
      unobserved: [],
      components: [claims([claim("inferred", "架空の手順"), claim("unverified", "")])],
      sessionRemaining: none,
    })

    expect(step).toEqual({
      kind: "verify",
      kindLabel: "確かめる: 2 件",
      label: "次の点を確かめて。",
      note: ["1. 架空の主張 inferred", "   確かめ方: 架空の手順", "2. 架空の主張 unverified"].join(
        "\n",
      ),
      draft: [
        "次の点を確かめて。",
        "1. 架空の主張 inferred",
        "   確かめ方: 架空の手順",
        "2. 架空の主張 unverified",
      ].join("\n"),
      points: 2,
    })
  })

  it("未確認だけなら未確認 n 件、推測だけなら推測 n 件", () => {
    const labelOf = (certainty: "inferred" | "unverified") =>
      buildNextSteps({
        unobserved: [],
        components: [claims([claim(certainty, "手順")])],
        sessionRemaining: none,
      }).flatMap((step) => (step.kind === "verify" ? [step.kindLabel] : []))[0]

    expect(labelOf("unverified")).toBe("確かめる: 未確認 1 件")
    expect(labelOf("inferred")).toBe("確かめる: 推測 1 件")
  })
})

describe("buildNextSteps の次のタスク", () => {
  const candidates = [
    { id: "T-1", summary: "架空のタスク1" },
    { id: "T-2", summary: "架空のタスク2" },
    { id: "T-3", summary: "架空のタスク3" },
  ]
  const stepsOf = (outcome: "finished" | "stopped" | "no-task", nextTasks = candidates) =>
    buildNextSteps({
      components: [],
      unobserved: [],
      sessionRemaining: none,
      ...(outcome === "no-task" ? {} : { outcome }),
      nextTasks,
    })

  it("タスクを終えたレポートは、候補の先頭2件を末尾に並べ、押すとその ID の依頼と題が入る", () => {
    expect(stepsOf("finished")).toEqual([
      {
        kind: "next-task",
        taskId: "T-1",
        kindLabel: "次のタスク",
        label: "タスク T-1 を進めて",
        note: "架空のタスク1",
        draft: "タスク T-1 を進めて\n架空のタスク1",
        points: 0,
      },
      expect.objectContaining({ kind: "next-task", taskId: "T-2" }),
    ])
  })

  it("止めたタスクとタスクに紐付かないレポートには出さない", () => {
    expect(stepsOf("stopped").some((step) => step.kind === "next-task")).toBe(false)
    expect(stepsOf("no-task")).toEqual([])
  })

  it("候補が無ければ出さない", () => {
    expect(stepsOf("finished", [])).toEqual([])
  })
})

describe("buildNextSteps の確かめていない検証の行", () => {
  const rows = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      label: `架空の検証${index + 1}`,
      howToVerify: `手順${index + 1}`,
    }))
  const stepsOf = (count: number) =>
    buildNextSteps({ components: [], unobserved: rows(count), sessionRemaining: none })

  it("行が無ければ対は出ない", () => {
    expect(stepsOf(0)).toEqual([])
  })

  it("行が1つなら、確かめた・違った の下書きを持つ対が1つ出る", () => {
    expect(stepsOf(1)).toEqual([
      {
        kind: "check-result",
        label: "架空の検証1",
        confirmedDraft: "「架空の検証1」を確かめた。問題なかった。",
        mismatchDraft: "「架空の検証1」を確かめたら、違っていた。",
      },
    ])
  })

  it("上限ちょうど（2行）なら、どちらも対になり、確かめるは出ない", () => {
    expect(stepsOf(2).map((step) => step.kind)).toEqual(["check-result", "check-result"])
  })

  it("上限を超えた行は対にせず、確かめるの1つにまとめる", () => {
    const steps = stepsOf(3)

    expect(steps.map((step) => step.kind)).toEqual(["verify", "check-result", "check-result"])
    expect(steps[0]).toEqual({
      kind: "verify",
      kindLabel: "確かめる: 1 件",
      label: "次の点を確かめて。",
      note: ["1. 架空の検証3", "   確かめ方: 手順3"].join("\n"),
      draft: ["次の点を確かめて。", "1. 架空の検証3", "   確かめ方: 手順3"].join("\n"),
      points: 1,
    })
  })
})
