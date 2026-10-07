import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 委譲中の脇の話（docs/architecture/testing.md「E2E のシナリオの一覧」）。場面 `aside-delegating` は
// 段2で背景の委譲を1件残したままターンを閉じる。そこへ入力欄から ⌘Enter で送ると、サーバが脇の話と決めて
// `aside` が戻り、次の場面 `aside-answer` のセリフが答えになる。札が増えず、帯が親の段取りのまま残り、
// 欄に言葉と答えの対が出ることを、DOM の構造とメッセージの列で確かめる。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** 脇の話のターンの `turn-finished` が何回目か（委譲したターン + 脇の話のターン）。 */
const ASIDE_TURN_FINISHED_OCCURRENCE = 2

describe("委譲中の脇の話", () => {
  it("背景のタスクが残っているあいだに送っても札は増えず、帯は親の段取りのまま、欄に答えが対で出る", async () => {
    const room = await run.open({
      scenario: "aside-thread",
      scene: "aside-delegating",
      viewport: "wide",
      domRoots: ["main", "dispatch"],
    })
    const main = room.page.locator('[data-region="main"]')
    await room.waitForEvent("turn-finished")

    const textArea = room.page.locator("textarea")
    await textArea.fill("いまどこ？（架空の脇の話）")
    await textArea.press("Meta+Enter")

    await room.waitForEvent("aside")
    await room.waitForEvent("turn-finished", ASIDE_TURN_FINISHED_OCCURRENCE)
    await main.getByText("脇の話 1件 ▾").waitFor()

    expect(await main.locator('section[aria-label="進み具合"]').innerText()).toContain(
      "委譲先に任せる",
    )
    expect(
      await main.locator("li", { hasText: "いまどこ？（架空の脇の話）" }).innerText(),
    ).toContain("いまは委譲先が段2を進めているところ。")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
