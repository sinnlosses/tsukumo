import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 段取りが移ったときのメインビュー（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 疑似セッションの場面 `work-plan` は3段の段取りを1段ずつ進め、全部の段を終えた `work_plan` と一緒に `report` を渡す。
// 4つ目の `tool-started`（`pnpm run test` が走り出したところ）のあとは次の手まで7秒空くので、そこで止めて撮る。
// 撮るのは、1段目のまとめが開いた中間レポートとして出て、その下に「ここから 2/3 …」の知らせがある状態。
// `work-plan-quick` は同じ手を詰めた版で、`turn-finished` まで流して撮る。
// 撮るのは、2つの中間レポートが畳まれ、知らせが2行並び、最後に「最終レポート」のラベルが付いた状態。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** 2段目に入ってから走り出すツール（`pnpm run test`）が、場面の中で何番目の `tool-started` か。 */
const SECOND_PHASE_LONG_TOOL_OCCURRENCE = 4

describe("段取りが移ったときのメインビュー", () => {
  it("段を進めると、ターンの途中でも終えた段の中間レポートと次の段の知らせが出る", async () => {
    const room = await run.open({
      scenario: "work-plan-phase-shift-running",
      scene: "work-plan",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("tool-started", SECOND_PHASE_LONG_TOOL_OCCURRENCE)
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("全部の段を終えて report が届くと、中間レポートは畳まれ、最終レポートにラベルが付く", async () => {
    const room = await run.open({
      scenario: "work-plan-phase-shift-finished",
      scene: "work-plan-quick",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
