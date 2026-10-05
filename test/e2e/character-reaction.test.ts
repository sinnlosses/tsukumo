import { describe, it } from "vitest"

import { WAITING_LINE_DELAY_MS } from "../../src/shared/session/shown-reaction.ts"
import { useScenarioRun } from "./scenario-run.ts"

// 機械の出来事 → キャラビューの反応の吹き出し（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面が流す迎えの挨拶（`welcome-greeting-changed`）に書かせた架空の行が、`data-reaction` の付いた吹き出しとして最新の位置に出る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** 依頼を待つ間の撮る経過。ターンが閉じてから待ちの一言を出すまでの間を越える。 */
const WAITING_ELAPSED_MS = WAITING_LINE_DELAY_MS + ELAPSED_MS

describe("機械の出来事 → キャラビューの反応", () => {
  it("送った直後は、文を出さず「…」が出る", async () => {
    const room = await run.open({
      scenario: "character-reaction-accepted",
      scene: "reaction-accepted",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("request")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("speak が届くと、「…」は消えてセリフだけになる", async () => {
    const room = await run.open({
      scenario: "character-reaction-replaced",
      scene: "reaction-accepted",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("API の呼び直しを待っているあいだは、再試行の反応が出る", async () => {
    const room = await run.open({
      scenario: "character-reaction-retrying",
      scene: "api-retry",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("api-retry")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("失敗で閉じると、失敗の反応が出る", async () => {
    const room = await run.open({
      scenario: "character-reaction-failed",
      scene: "api-failure",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("利用上限で閉じると、前のセリフの下に利用上限の反応が最新として出る", async () => {
    const room = await run.open({
      scenario: "character-reaction-limited",
      scene: "rate-limit",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("依頼を待つ間が続くと、本体が report に書いた待ちの一言が最新として出る", async () => {
    const room = await run.open({
      scenario: "character-reaction-waiting-line",
      scene: "waiting-line",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(WAITING_ELAPSED_MS)
  })

  it("本体が待ちの一言を書いていなければ、迎えの挨拶と同じ答えで書かせた待ちの行が出る", async () => {
    const room = await run.open({
      scenario: "character-reaction-waiting-idle",
      scene: "waiting-idle",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(WAITING_ELAPSED_MS)
  })
})
