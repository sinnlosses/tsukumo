import { describe, expect, it } from "vitest"

import { conclusionWithTaskName, parseReportTask } from "../../../src/shared/report/report-task.ts"

describe("parseReportTask", () => {
  it("前の記録の終わり方 shipped は finished として読む", () => {
    expect(parseReportTask({ id: "X-7", name: "架空の作業", outcome: "shipped" })).toEqual({
      kind: "task",
      id: "X-7",
      name: "架空の作業",
      outcome: "finished",
      genre: "unspecified",
    })
  })

  it.each([
    ["work", "work", "work"],
    ["decision", "decision", "decision"],
    ["research", "research", "research"],
    ["無い", undefined, "unspecified"],
    ["知らない文字列", "plan", "unspecified"],
    ["文字列でない", 3, "unspecified"],
  ] as const)("genre が %s なら、task を捨てずに種類を %s から %s と読む", (_, genre, expected) => {
    const task = parseReportTask({ id: "X-7", name: "架空の作業", outcome: "finished", genre })

    expect(task).toEqual({
      kind: "task",
      id: "X-7",
      name: "架空の作業",
      outcome: "finished",
      genre: expected,
    })
  })

  it("genre が読めても、ID が空なら none に畳む", () => {
    expect(
      parseReportTask({ id: "", name: "架空の作業", outcome: "finished", genre: "work" }),
    ).toEqual({ kind: "none" })
  })
})

describe("conclusionWithTaskName", () => {
  it("1行に残す結論の行内の印は素の文字へ畳む", () => {
    expect(conclusionWithTaskName("架空の {{12 → 8}} 秒", { kind: "none" })).toBe(
      "架空の 12 → 8 秒",
    )
  })
})
