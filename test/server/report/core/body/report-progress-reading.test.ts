import { describe, expect, it } from "vitest"

import {
  type ProgressFieldsInput,
  readProgressFields,
} from "../../../../../src/server/report/core/body/report-progress-reading.ts"
import type { ReportTask } from "../../../../../src/shared/report/report-task.ts"

const NO_FIELDS = {
  verdict: undefined,
  next: undefined,
  assumptions: undefined,
  sources: undefined,
  previous: undefined,
  guideNotes: undefined,
  favor: "",
  task: { kind: "none" },
  workPlanClosing: "none",
} as const satisfies ProgressFieldsInput

function taskOf(outcome: "finished" | "stopped" | "awaiting-answer"): ReportTask {
  return { kind: "task", id: "T-1", name: "架空の作業", outcome, genre: "unspecified" }
}

describe("readProgressFields", () => {
  it.each([
    ["finished", "done"],
    ["stopped", "stopped"],
    ["awaiting-answer", "yours"],
  ] as const)(
    "verdict が無く task.outcome が %s なら判定は %s、閉じ方は none のまま",
    (outcome, verdict) => {
      const read = readProgressFields({ ...NO_FIELDS, task: taskOf(outcome) })

      expect(read).toMatchObject({
        verdict,
        verdictWritten: false,
        closingConflict: false,
        next: { kind: "none" },
        workPlanClosing: "none",
      })
    },
  )

  it("verdict も task も無ければ判定は done", () => {
    expect(readProgressFields(NO_FIELDS)).toMatchObject({
      verdict: "done",
      next: { kind: "none" },
      workPlanClosing: "none",
    })
  })

  it("favor は利用者の次の手に読み替え、書いた閉じ方はそのまま残す", () => {
    const read = readProgressFields({
      ...NO_FIELDS,
      task: taskOf("finished"),
      favor: "架空の確認をしてほしい",
      workPlanClosing: "finished",
    })

    expect(read).toMatchObject({
      verdict: "done",
      next: { kind: "next", owner: "you", action: "架空の確認をしてほしい", choices: [] },
      workPlanClosing: "finished",
    })
  })

  it("書いた verdict は task.outcome に勝ち、閉じ方を書いていなければ判定から導く", () => {
    const read = readProgressFields({ ...NO_FIELDS, verdict: "yours", task: taskOf("finished") })

    expect(read).toMatchObject({
      verdict: "yours",
      verdictWritten: true,
      closingConflict: false,
      next: { kind: "none" },
      workPlanClosing: "stopped",
    })
  })

  it("verdict が partial なら閉じ方は finished", () => {
    expect(readProgressFields({ ...NO_FIELDS, verdict: "partial" })).toMatchObject({
      verdict: "partial",
      workPlanClosing: "finished",
    })
  })

  it("書いた next は favor に勝ち、failed の閉じ方は stopped", () => {
    const read = readProgressFields({
      ...NO_FIELDS,
      verdict: "failed",
      favor: "架空のお願い",
      next: { owner: "writer", action: "架空の続き" },
    })

    expect(read).toMatchObject({
      verdict: "failed",
      next: { kind: "next", owner: "writer", action: "架空の続き", choices: [] },
      workPlanClosing: "stopped",
    })
  })

  it("verdict と書いた閉じ方が食い違えば、閉じ方は書いたまま残し食い違いを立てる", () => {
    const read = readProgressFields({ ...NO_FIELDS, verdict: "done", workPlanClosing: "stopped" })

    expect(read).toMatchObject({
      verdict: "done",
      closingConflict: true,
      workPlanClosing: "stopped",
    })
  })

  it("形の崩れた欄は「無い」に畳む", () => {
    const read = readProgressFields({
      ...NO_FIELDS,
      verdict: "x",
      next: { owner: "main", action: "架空" },
      assumptions: "架空の前提",
      sources: { mark: 1, place: "a.ts:1" },
      previous: { resolved: [] },
      guideNotes: [{ target: "checks" }],
    })

    expect(read).toEqual({
      verdict: "done",
      verdictWritten: false,
      closingConflict: false,
      next: { kind: "none" },
      assumptions: [],
      sources: [],
      previous: { kind: "none" },
      guideNotes: [],
      workPlanClosing: "none",
    })
  })

  it("次の手の選べる答えは先頭3つに丸める", () => {
    const read = readProgressFields({
      ...NO_FIELDS,
      next: { owner: "you", action: "架空の問い", choices: ["甲", "乙", "丙", "丁"] },
    })

    expect(read.next).toEqual({
      kind: "next",
      owner: "you",
      action: "架空の問い",
      choices: ["甲", "乙", "丙"],
    })
  })

  it("6つの欄の要素は、入力にあるものが出力に全部残る", () => {
    const input = {
      ...NO_FIELDS,
      verdict: "yours",
      next: { owner: "you", action: "架空の問い", choices: ["甲", "乙"] },
      assumptions: ["架空の前提1", "架空の前提2"],
      sources: [
        { mark: 1, place: "a.ts:1", note: "架空" },
        { mark: 2, place: "架空の一次情報" },
      ],
      previous: { resolved: ["架空1"], added: ["架空2", "架空3"], remaining: ["架空4"] },
      guideNotes: [
        { target: "checks", text: "架空の案内" },
        { target: "s1", text: "架空の案内2" },
      ],
    } as const satisfies ProgressFieldsInput
    const read = readProgressFields(input)

    expect(leafCount(read)).toEqual(leafCount(input))
    expect(leafCount({ ...read, sources: read.sources.slice(1) }) === leafCount(input)).toBe(false)
  })
})

// 6つの欄の中の文字列と数（葉）を、欄ごとに再帰で数える。読み替えで要素が落ちていないかの物差し。
function leafCount(fields: {
  readonly verdict: unknown
  readonly next: unknown
  readonly assumptions: unknown
  readonly sources: unknown
  readonly previous: unknown
  readonly guideNotes: unknown
}): Readonly<Record<string, number>> {
  return {
    verdict: leaves(fields.verdict),
    next: leaves(fields.next) - (isKinded(fields.next) ? 1 : 0),
    assumptions: leaves(fields.assumptions),
    sources: leaves(fields.sources),
    previous: leaves(fields.previous) - (isKinded(fields.previous) ? 1 : 0),
    guideNotes: leaves(fields.guideNotes),
  }
}

function isKinded(value: unknown): boolean {
  return typeof value === "object" && value !== null && "kind" in value
}

function leaves(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum: number, item) => sum + leaves(item), 0)
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).reduce((sum: number, item) => sum + leaves(item), 0)
  }
  return value === undefined ? 0 : 1
}
