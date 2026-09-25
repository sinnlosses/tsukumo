import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// speak → キャラビューの吹き出し（docs/design.md 10章「E2E のシナリオの一覧」）。`speech` イベントが
// キャラビューの吹き出し（`<Balloon>`、`data-latest`）に積まれることを、疑似セッションの2つの場面で
// 確かめる: `closing-narration`（締めの一言が最終レポートの後ろに続く）と `question-multi`
// （1つのやり取りの中でセリフが3つ積み上がる）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("speak → キャラビューの吹き出し", () => {
  it("締めの speak が最終レポートのあとに続く吹き出しとして残る", async () => {
    const room = await run.open({
      scenario: "speak-bubble-closing-narration",
      scene: "closing-narration",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("1つのやり取りの中で speak が3回届くと、吹き出しが3つ並んで残る", async () => {
    const room = await run.open({
      scenario: "speak-bubble-question-multi",
      scene: "question-multi",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
