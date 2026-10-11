import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 復元した雑談の履歴（docs/architecture/testing.md「E2E のシナリオの一覧」）。疑似セッションの場面
// `chat-restored-history` は、前のセッションの1件のやり取りを `resume` で切り替え先に出し、
// 起動した代にはいまのセッションの2件のやり取りを流す。2回目の `turn-finished` を待ってから
// 切り替え画面で前のセッションを選ぶと、雑談のまま、前のセッションの履歴に続けて、
// 切り替え先が流し直した起動のセリフといまの2件に起き直す。
// 切り替え先の流し直しが終わるまで届いてから撮る（途中で撮ると、負荷で撮る時点が前後して揺れる）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** 切り替える前に流れる `turn-finished` の回数（いまの2件）。 */
const LAST_TURN_FINISHED_OCCURRENCE = 2

/** 切り替え先が場面を流し直し終えた `turn-finished` の、ページに届いてからの通算の回数。 */
const RESTARTED_TURN_FINISHED_OCCURRENCE = 4

describe("復元した雑談の履歴", () => {
  it("雑談のまま前のセッションを選ぶと、組み直した履歴に起き直す", async () => {
    const room = await run.open({
      scenario: "chat-restored-history",
      scene: "chat-restored-history",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished", LAST_TURN_FINISHED_OCCURRENCE)
    await room.page.getByRole("button", { name: /押すとセッションを切り替える画面を開く/u }).click()
    const search = room.page.getByRole("combobox", { name: "セッションを探す" })
    await search.waitFor()
    await search.press("ArrowDown")
    await search.press("Enter")
    await room.waitForEvent("turn-finished", RESTARTED_TURN_FINISHED_OCCURRENCE)
    await room.settleAndMatch(ELAPSED_MS)
  })
})
