import { describe, expect, it } from "vitest"

import { sealOfCheck } from "../../../src/shared/report/report-check-seal.ts"
import type {
  ReportVerification,
  VerificationStage,
} from "../../../src/shared/report/report-verification.ts"

const NONE: ReportVerification = { kind: "none" }

const stage = (name: string, result: VerificationStage["result"]): VerificationStage => ({
  name,
  result,
  count: { kind: "counted", tests: 12 },
})

const checked = (...stages: readonly VerificationStage[]): ReportVerification => ({
  kind: "checked",
  stages,
})

describe("sealOfCheck", () => {
  it("ok の行は、同じ依頼で打った Bash が成功で終わっていれば記録あり（実行）", () => {
    expect(sealOfCheck({ status: "ok", command: "架空のコマンド" }, "succeeded", NONE)).toEqual({
      kind: "run",
    })
  })

  it("ng の行は、打った Bash が失敗で終わっていれば記録あり（実行）", () => {
    expect(sealOfCheck({ status: "ng", command: "架空のコマンド" }, "failed", NONE)).toEqual({
      kind: "run",
    })
  })

  it.each([
    ["Bash が失敗なのに ok", "ok", "failed"],
    ["Bash が成功なのに ng", "ng", "succeeded"],
    ["Bash がまだ走っている", "ok", "running"],
    ["Bash を打っていない", "ok", "none"],
  ] as const)("%s の行は、控えも無ければ申告のみ", (_name, status, bash) => {
    expect(sealOfCheck({ status, command: "架空のコマンド" }, bash, NONE)).toEqual({
      kind: "claimed",
    })
  })

  it("tw verify の行は、控えの段の成否が合えば記録あり（控え）で、段を持つ", () => {
    const verification = checked(stage("typecheck", "passed"), stage("test", "carried"))

    expect(sealOfCheck({ status: "ok", command: "tw verify" }, "none", verification)).toEqual({
      kind: "record",
      stage: stage("typecheck", "passed"),
    })
  })

  it("pnpm run <段> を含む行は、その名前の段と照らす（名前の後ろが空白か末尾のときだけ）", () => {
    const verification = checked(stage("test:e2e", "failed"), stage("test", "passed"))

    expect(
      sealOfCheck({ status: "ok", command: "pnpm run test a.test.ts" }, "none", verification),
    ).toEqual({ kind: "record", stage: stage("test", "passed") })
    expect(
      sealOfCheck({ status: "ng", command: "pnpm run test:e2e" }, "none", verification),
    ).toEqual({ kind: "record", stage: stage("test:e2e", "failed") })
    expect(
      sealOfCheck({ status: "ok", command: "pnpm run testing" }, "none", verification),
    ).toEqual({ kind: "claimed" })
  })

  it("控えの段が failed なのに ok の行は申告のみ", () => {
    expect(
      sealOfCheck(
        { status: "ok", command: "pnpm run test" },
        "none",
        checked(stage("test", "failed")),
      ),
    ).toEqual({ kind: "claimed" })
  })

  it("command が空の行は、Bash や控えがあっても申告のみ", () => {
    expect(
      sealOfCheck({ status: "ok", command: "  " }, "succeeded", checked(stage("test", "passed"))),
    ).toEqual({ kind: "claimed" })
  })

  it.each(["unobserved", "blocked"])("%s の行はいつも申告のみ", (status) => {
    expect(
      sealOfCheck({ status, command: "tw verify" }, "succeeded", checked(stage("test", "passed"))),
    ).toEqual({ kind: "claimed" })
  })
})
