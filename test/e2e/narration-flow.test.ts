import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// 途中の発話と流れる本文（docs/design.md 10章「E2E のシナリオの一覧」）。疑似セッションの2つの
// 場面で確かめる: `narration`（あとにツールが続いた実況は落ち、最後の本文だけ残る）、
// `long-report`（長いレポートが `partial-utterance` を重ねて届いても、最終的に全文が1つの
// 本文として残る）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("途中の発話と流れる本文", () => {
  it("あとにツールが続いた実況は落ち、最後の本文だけが残る", async () => {
    const room = await run.open({ scenario: "narration", scene: "narration", viewport: "wide" })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("partial-utterance を重ねて届いた長いレポートが、最終的に全文として残る", async () => {
    const room = await run.open({ scenario: "long-report", scene: "long-report", viewport: "wide" })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
