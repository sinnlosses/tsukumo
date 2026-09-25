import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// ターンの履歴（docs/design.md 10章「E2E のシナリオの一覧」）。疑似セッションの場面
// `turn-history` は4つのやり取りを続けて流す。最後の1つは、札の頭に出る依頼の1行目が
// 長いときにどう省略されるかを確かめるための依頼。4回目の `turn-finished` まで待ってから撮る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** `turn-history` が流す `turn-finished` の回数（4つのやり取り）。 */
const LAST_TURN_FINISHED_OCCURRENCE = 4

describe("ターンの履歴", () => {
  it("複数のやり取りが札として積み上がり、長い依頼の1行目は省略される", async () => {
    const room = await run.open({
      scenario: "turn-history",
      scene: "turn-history",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished", LAST_TURN_FINISHED_OCCURRENCE)
    await room.settleAndMatch(ELAPSED_MS)
  })
})
