import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// 入力欄から送る（docs/design.md 10章「E2E のシナリオの一覧」）。場面は名指しせず
// （`opening` のまま）、入力欄に文面を書いて ⌘Enter で送る。送った `prompt` コマンドが
// `request` イベントとして戻り、依頼を受けた疑似セッションの `turns` の先頭（`report`）が
// 続けて流れることを、DOM の構造とメッセージの列で確かめる。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("入力欄から送る", () => {
  it("入力欄に書いて ⌘Enter で送ると prompt が流れ、request が戻って続きの場面が流れる", async () => {
    const room = await run.open({ scenario: "input-dispatch", scene: "none", viewport: "wide" })

    const textArea = room.page.locator("textarea")
    await textArea.fill("入力欄から送る場面を見たい（架空の依頼）")
    await textArea.press("Meta+Enter")

    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
