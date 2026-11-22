import { describe, expect, it } from "vitest"

import {
  delegateReturnOf,
  parsePhaseResult,
} from "../../../../src/server/work-plan/core/phase-result.ts"

const NUMBERED = { kind: "numbered", phase: 1, count: 2 } as const

describe("parsePhaseResult", () => {
  it("3つの結果を読み、止めた理由は stopped だけが持つ", () => {
    expect(parsePhaseResult({ phase: 1, count: 2, outcome: "finished" })).toEqual({
      position: NUMBERED,
      outcome: "finished",
      summary: "",
    })
    expect(
      parsePhaseResult({ phase: 1, count: 2, outcome: "finished", summary: "架空のまとめ。" }),
    ).toEqual({ position: NUMBERED, outcome: "finished", summary: "架空のまとめ。" })
    expect(parsePhaseResult({ phase: 1, count: 2, outcome: "finished", summary: " " })).toEqual({
      position: NUMBERED,
      outcome: "finished",
      summary: "",
    })
    expect(parsePhaseResult({ phase: 2, count: 2, outcome: "skipped" })).toEqual({
      position: { kind: "numbered", phase: 2, count: 2 },
      outcome: "skipped",
    })
    expect(
      parsePhaseResult({ phase: 1, count: 2, outcome: "stopped", reason: "架空の理由。" }),
    ).toEqual({ position: NUMBERED, outcome: "stopped", reason: "架空の理由。" })
  })

  it("step だけなら段の id の位置で読む", () => {
    expect(parsePhaseResult({ step: "架空の段", outcome: "skipped" })).toEqual({
      position: { kind: "step", step: "架空の段" },
      outcome: "skipped",
    })
  })

  it("step と phase・count の両方があれば step を使う", () => {
    expect(parsePhaseResult({ step: "架空の段", phase: 1, count: 2, outcome: "skipped" })).toEqual({
      position: { kind: "step", step: "架空の段" },
      outcome: "skipped",
    })
  })

  it("step も phase・count も無ければ位置なしで読む", () => {
    expect(parsePhaseResult({ outcome: "skipped" })).toEqual({
      position: { kind: "unplaced" },
      outcome: "skipped",
    })
  })

  it.each([
    ["phase が 0", { phase: 0, count: 2, outcome: "finished" }],
    ["phase が count を超える", { phase: 3, count: 2, outcome: "finished" }],
    ["整数でない phase", { phase: 1.5, count: 2, outcome: "finished" }],
    ["phase だけで count が無い", { phase: 1, outcome: "finished" }],
    ["count だけで phase が無い", { count: 2, outcome: "finished" }],
    ["空の step", { step: "", outcome: "finished" }],
    ["知らない結果", { phase: 1, count: 2, outcome: "done" }],
    ["stopped に理由が無い", { phase: 1, count: 2, outcome: "stopped" }],
    ["stopped の理由が空白だけ", { phase: 1, count: 2, outcome: "stopped", reason: " " }],
    ["stopped でないのに理由がある", { phase: 1, count: 2, outcome: "skipped", reason: "架空" }],
    [
      "finished でないのにまとめがある",
      { phase: 1, count: 2, outcome: "skipped", summary: "架空" },
    ],
  ])("%s は受け付けない", (_, input) => {
    expect(parsePhaseResult(input)).toBeUndefined()
  })
})

describe("delegateReturnOf", () => {
  it("finished は要約の空の段、skipped は飛ばした段、stopped は理由を要約にした止めた返却にする", () => {
    expect(delegateReturnOf({ position: NUMBERED, outcome: "finished", summary: "" })).toEqual({
      kind: "phase-done",
      position: NUMBERED,
      summary: "",
    })
    expect(
      delegateReturnOf({ position: NUMBERED, outcome: "finished", summary: "架空のまとめ。" }),
    ).toEqual({ kind: "phase-done", position: NUMBERED, summary: "架空のまとめ。" })
    expect(delegateReturnOf({ position: NUMBERED, outcome: "skipped" })).toEqual({
      kind: "phase-skipped",
      position: NUMBERED,
    })
    expect(
      delegateReturnOf({ position: NUMBERED, outcome: "stopped", reason: "架空の理由。" }),
    ).toEqual({ kind: "stopped", position: NUMBERED, summary: "架空の理由。" })
  })
})
