import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// 復元した雑談の履歴（docs/design.md 10章「E2E のシナリオの一覧」）。疑似セッションの場面
// `chat-restored-history` は、前のセッションの組み直した1件のやり取りのあとに
// `history-restored` を流し、続けていまのセッションの2件のやり取りを流す。3回目の
// `turn-finished` まで待つと、前のセッションといまのやり取りがどちらも履歴に残った状態になる。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** `chat-restored-history` が流す `turn-finished` の回数（復元前1件 + 復元後2件）。 */
const LAST_TURN_FINISHED_OCCURRENCE = 3

describe("復元した雑談の履歴", () => {
  it("history-restored をまたいでも、前のセッションといまの履歴がどちらも残る", async () => {
    const room = await run.open({
      scenario: "chat-restored-history",
      scene: "chat-restored-history",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished", LAST_TURN_FINISHED_OCCURRENCE)
    await room.settleAndMatch(ELAPSED_MS)
  })
})
