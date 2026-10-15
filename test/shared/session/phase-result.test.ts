import { describe, expect, it } from "vitest"

import { delegateReturnOf, parsePhaseResult } from "../../../src/shared/session/phase-result.ts"

describe("parsePhaseResult", () => {
  it("3つの結果を読み、止めた理由は stopped だけが持つ", () => {
    expect(parsePhaseResult({ phase: 1, count: 2, outcome: "finished" })).toEqual({
      phase: 1,
      count: 2,
      outcome: "finished",
    })
    expect(parsePhaseResult({ phase: 2, count: 2, outcome: "skipped" })).toEqual({
      phase: 2,
      count: 2,
      outcome: "skipped",
    })
    expect(
      parsePhaseResult({ phase: 1, count: 2, outcome: "stopped", reason: "架空の理由。" }),
    ).toEqual({ phase: 1, count: 2, outcome: "stopped", reason: "架空の理由。" })
  })

  it.each([
    ["phase が 0", { phase: 0, count: 2, outcome: "finished" }],
    ["phase が count を超える", { phase: 3, count: 2, outcome: "finished" }],
    ["整数でない phase", { phase: 1.5, count: 2, outcome: "finished" }],
    ["知らない結果", { phase: 1, count: 2, outcome: "done" }],
    ["stopped に理由が無い", { phase: 1, count: 2, outcome: "stopped" }],
    ["stopped の理由が空白だけ", { phase: 1, count: 2, outcome: "stopped", reason: " " }],
    ["stopped でないのに理由がある", { phase: 1, count: 2, outcome: "skipped", reason: "架空" }],
  ])("%s は受け付けない", (_, input) => {
    expect(parsePhaseResult(input)).toBeUndefined()
  })
})

describe("delegateReturnOf", () => {
  it("finished は要約の空の段、skipped は飛ばした段、stopped は理由を要約にした止めた返却にする", () => {
    expect(delegateReturnOf({ phase: 1, count: 2, outcome: "finished" })).toEqual({
      kind: "phase-done",
      phase: 1,
      count: 2,
      summary: "",
    })
    expect(delegateReturnOf({ phase: 1, count: 2, outcome: "skipped" })).toEqual({
      kind: "phase-skipped",
      phase: 1,
      count: 2,
    })
    expect(
      delegateReturnOf({ phase: 1, count: 2, outcome: "stopped", reason: "架空の理由。" }),
    ).toEqual({ kind: "stopped", phase: 1, count: 2, summary: "架空の理由。" })
  })
})
