import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// ターンの履歴（docs/architecture/testing.md「E2E のシナリオの一覧」）。疑似セッションの場面
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
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished", LAST_TURN_FINISHED_OCCURRENCE)
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("メインビューにフォーカスがあるとき [ ] で前後のターンへ移り、入力欄の中では移らない", async () => {
    const room = await run.open({
      scenario: "turn-history-keys",
      scene: "turn-history",
      viewport: "wide",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished", LAST_TURN_FINISHED_OCCURRENCE)
    const position = room.page.locator('[class*="turn-position"]')

    await room.page.locator("[data-main-view]").focus()
    await room.page.keyboard.press("[")
    await expect.poll(() => position.textContent()).toBe("3 / 4")
    await room.page.keyboard.press("]")
    await expect.poll(() => position.textContent()).toBe("4 / 4")

    const field = room.page.getByRole("textbox", { name: "依頼を書く" })
    await field.focus()
    await room.page.keyboard.press("[")
    await expect.poll(() => field.inputValue()).toBe("[")
    expect(await position.textContent()).toBe("4 / 4")
  })
})
