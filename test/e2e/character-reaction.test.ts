import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 機械の出来事 → キャラビューの反応の吹き出し（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 既定のパック `tsukumo-spirit` の `reactions` の見本が、`data-reaction` の付いた吹き出しとして最新の位置に出る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("機械の出来事 → キャラビューの反応", () => {
  it("送った直後は、受けたの反応が出る", async () => {
    const room = await run.open({
      scenario: "character-reaction-accepted",
      scene: "reaction-accepted",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("request")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("speak が届くと、受けたの反応は消えてセリフだけになる", async () => {
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
})
