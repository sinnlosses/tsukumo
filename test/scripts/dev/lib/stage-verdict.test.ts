// `STAGE` 行の4値の決め方（0件・終了コード2・錠の待ち切れ・stopped の境界）を検証する。

import { describe, expect, test } from "vitest"

import { e2eStage, FULL_STAGE_NAMES, planStages } from "../../../../scripts/dev/lib/check-stage.ts"
import {
  formatStageLines,
  parseSelectedTestCount,
  ranStageVerdict,
  type RanStage,
  withDroppedStages,
} from "../../../../scripts/dev/lib/stage-verdict.ts"

function ran(overrides: Partial<RanStage>): RanStage {
  return {
    name: "test",
    status: 0,
    stopped: false,
    lockTimedOut: false,
    selectedTestCount: 10,
    ...overrides,
  }
}

describe("ranStageVerdict", () => {
  test("終了コード0でテストが選ばれていれば pass", () => {
    expect(ranStageVerdict(ran({}))).toBe("pass")
  })

  test("レポートを書かない段は数が分からないので、終了コード0なら pass", () => {
    expect(ranStageVerdict(ran({ name: "lint", selectedTestCount: undefined }))).toBe("pass")
  })

  test("終了コードが0でなければ fail", () => {
    expect(ranStageVerdict(ran({ status: 1 }))).toBe("fail")
  })

  test("選ばれたテストが0件で終了コード0なら unobserved", () => {
    expect(ranStageVerdict(ran({ selectedTestCount: 0 }))).toBe("unobserved")
  })

  test("0件でも終了コードが0でなければ fail", () => {
    expect(ranStageVerdict(ran({ status: 1, selectedTestCount: 0 }))).toBe("fail")
  })

  test("E2E の終了コード2は blocked", () => {
    expect(ranStageVerdict(ran({ name: "test:e2e", status: 2 }))).toBe("blocked")
  })

  test("E2E 以外の終了コード2は fail", () => {
    expect(ranStageVerdict(ran({ name: "lint", status: 2 }))).toBe("fail")
  })

  test("錠の待ち切れは blocked", () => {
    expect(ranStageVerdict(ran({ name: "test:e2e", status: 1, lockTimedOut: true }))).toBe(
      "blocked",
    )
  })

  test("止めた段は blocked にせず unobserved", () => {
    expect(ranStageVerdict(ran({ name: "test:e2e", status: 2, stopped: true }))).toBe("unobserved")
  })
})

describe("withDroppedStages", () => {
  function passAll(names: readonly string[]) {
    return names.map((name) => ({ name, verdict: "pass" as const }))
  }
  function verdictsOf(plan: ReturnType<typeof planStages>) {
    return withDroppedStages(FULL_STAGE_NAMES, passAll(plan.stages.map((stage) => stage.name)))
  }

  test("E2E を選ばなかった変更では test:e2e が unobserved で並ぶ", () => {
    const plan = planStages(["src/server/a.ts"], () => [], false, [])
    expect(verdictsOf(plan)).toEqual([
      ...passAll(["typecheck", "lint", "format:check", "token-limit", "test"]),
      { name: "test:e2e", verdict: "unobserved" },
    ])
  })

  test("文書だけの変更では落とした4段が全段の順で unobserved、文書の検査は後ろに足される", () => {
    const plan = planStages(["README.md"], () => [], false, [])
    expect(verdictsOf(plan)).toEqual([
      { name: "typecheck", verdict: "unobserved" },
      { name: "lint", verdict: "unobserved" },
      { name: "format:check", verdict: "pass" },
      { name: "token-limit", verdict: "pass" },
      { name: "test", verdict: "unobserved" },
      { name: "test:e2e", verdict: "unobserved" },
      { name: "test:document", verdict: "pass" },
    ])
  })

  test("6段すべてを計画したときは落とした段が無い", () => {
    const plan = planStages([], () => [e2eStage([])], true, [])
    expect(verdictsOf(plan)).toEqual(passAll(FULL_STAGE_NAMES))
  })

  test("計画の値はそのまま残す", () => {
    expect(withDroppedStages(["a", "b"], [{ name: "b", verdict: "fail" }])).toEqual([
      { name: "a", verdict: "unobserved" },
      { name: "b", verdict: "fail" },
    ])
  })
})

describe("formatStageLines", () => {
  test("段の順に1段1行のタブ区切りにする", () => {
    expect(
      formatStageLines(
        [
          { name: "lint", verdict: "pass" },
          { name: "test:e2e", verdict: "blocked" },
        ],
        [],
      ),
    ).toEqual(["STAGE\tlint\tpass", "STAGE\ttest:e2e\tblocked"])
  })

  test("bail が発火した段は、その行の次に bailed の行を足す", () => {
    expect(
      formatStageLines(
        [
          { name: "test", verdict: "pass" },
          { name: "test:e2e", verdict: "fail" },
        ],
        ["test:e2e"],
      ),
    ).toEqual(["STAGE\ttest\tpass", "STAGE\ttest:e2e\tfail", "STAGE\ttest:e2e\tbailed"])
  })
})

describe("parseSelectedTestCount", () => {
  test("numTotalTests を返す", () => {
    expect(parseSelectedTestCount(JSON.stringify({ numTotalTests: 0 }))).toBe(0)
    expect(parseSelectedTestCount(JSON.stringify({ numTotalTests: 7 }))).toBe(7)
  })

  test("読めない・形が違う JSON は undefined", () => {
    expect(parseSelectedTestCount("not json")).toBeUndefined()
    expect(parseSelectedTestCount("null")).toBeUndefined()
    expect(parseSelectedTestCount("{}")).toBeUndefined()
  })
})
