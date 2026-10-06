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
  it("送った直後は文を出さず「…」が出て、speak が届くと「…」は消えてセリフだけになる", async () => {
    const room = await run.open({
      scenario: "character-reaction-replaced",
      scene: "reaction-accepted",
      viewport: "wide",
      domRoots: ["character"],
    })
    const character = room.page.locator('[data-region="character"]')

    await room.waitForEvent("request")
    await character.locator('[data-latest="true"][data-writing="true"]').waitFor()

    await room.waitForEvent("turn-finished")
    await character.locator('[data-writing="true"]').waitFor({ state: "detached" })
    await room.settleAndMatch(ELAPSED_MS)
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
