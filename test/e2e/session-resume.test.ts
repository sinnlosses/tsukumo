import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 続きから開く（docs/architecture/testing.md「E2E のシナリオの一覧」）。疑似セッションの場面
// `session-resume` は過去の transcript を続きとして持ち、起こした時点で組み直した履歴が
// `hello` に載る。場面自身は何も流さないので、開いた直後の姿をそのまま撮る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("続きから開く", () => {
  it("前のセッションのやり取りがメインビューに出る", async () => {
    const room = await run.open({
      scenario: "session-resume",
      scene: "session-resume",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.settleAndMatch(ELAPSED_MS)
  })
})
