import { describe, expect, test } from "vitest"

import {
  formatScoringSheet,
  parseAcceptanceDecisions,
  sampleDecisions,
  seededRandom,
  type AcceptanceDecision,
} from "../../../scripts/shared/acceptance-sample.ts"

function line(value: unknown): string {
  return JSON.stringify(value)
}

function decision(verdict: "accept" | "reject", index: number): AcceptanceDecision {
  return {
    verdict,
    taskId: `GH-${String(index)}`,
    tree: `tree${String(index)}`,
    findings: verdict === "reject" ? ["指摘"] : [],
    findingKinds: verdict === "reject" ? ["正しさ"] : [],
  }
}

describe("parseAcceptanceDecisions", () => {
  test("受け入れ役の判定だけを、implement の結果から読んだタスクの ID つきで取り出す", () => {
    const taskId = "GH".concat("-12")
    const journal = [
      line({ type: "launched" }),
      line({ type: "started", agentId: "a", label: "implement" }),
      line({ type: "result", agentId: "a", result: { stepLines: [`STEPPED\t${taskId}\t1/2`] } }),
      line({ type: "started", agentId: "b", label: "acceptor-1" }),
      line({
        type: "result",
        agentId: "b",
        result: { verdict: "reject", tree: "abc", findings: ["x"], findingKinds: ["正しさ"] },
      }),
      line({ type: "started", agentId: "c", label: "retrospect" }),
      line({ type: "result", agentId: "c", result: { verdict: "accept" } }),
      "壊れた行",
    ].join("\n")

    expect(parseAcceptanceDecisions(journal)).toEqual([
      {
        verdict: "reject",
        taskId,
        tree: "abc",
        findings: ["x"],
        findingKinds: ["正しさ"],
      },
    ])
  })
})

describe("parseAcceptanceDecisions の木", () => {
  test("受け入れ役の結果に木が無いときは、同じ番号の accept-prepare の木で補う", () => {
    const journal = [
      line({ type: "started", agentId: "p", label: "accept-prepare-2" }),
      line({ type: "result", agentId: "p", result: { tree: "prepared" } }),
      line({ type: "started", agentId: "b", label: "acceptor-2" }),
      line({ type: "result", agentId: "b", result: { verdict: "accept" } }),
    ].join("\n")

    expect(parseAcceptanceDecisions(journal).map((entry) => entry.tree)).toEqual(["prepared"])
  })
})

describe("sampleDecisions", () => {
  const pool = [
    ...Array.from({ length: 30 }, (_, index) => decision("reject", index)),
    ...Array.from({ length: 20 }, (_, index) => decision("accept", 100 + index)),
  ]

  test("判定ごとに指定の件数を重複なく抜き、同じ種なら同じ結果になる", () => {
    const first = sampleDecisions(pool, { reject: 20, accept: 10 }, seededRandom(1))
    const again = sampleDecisions(pool, { reject: 20, accept: 10 }, seededRandom(1))

    expect(first.filter((item) => item.verdict === "reject")).toHaveLength(20)
    expect(first.filter((item) => item.verdict === "accept")).toHaveLength(10)
    expect(new Set(first.map((item) => item.taskId)).size).toBe(30)
    expect(again).toEqual(first)
  })

  test("母数が足りないときは取れるだけ抜く", () => {
    expect(
      sampleDecisions(pool.slice(0, 3), { reject: 20, accept: 10 }, seededRandom(1)),
    ).toHaveLength(3)
  })
})

describe("formatScoringSheet", () => {
  test("差し戻しと通しで違う採点の欄を持つ", () => {
    const sheet = formatScoringSheet([decision("reject", 1), decision("accept", 2)])

    expect(sheet).toContain("正しい / 誤り / どちらとも言えない")
    expect(sheet).toContain("不具合あり / なし")
  })
})
