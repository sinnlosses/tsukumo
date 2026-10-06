import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// セッションの札と切り替え画面（docs/architecture/testing.md「E2E のシナリオの一覧」）。fake driver は claude を
// 起こさないので切り替え先の一覧を持たない。疑似セッションの場面 `session-list` が作り物の一覧を
// `sessions-changed` で流す。一覧が届くのを待ってから札を押す（場面が流れ終わるのを時間で待たない）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。 */
const ELAPSED_MS = 60_000

/** 札の読み上げの名前（部屋の名前・短縮ID・押すと何が起きるか）。 */
const SESSION_TAG = /セッション FA。押すとセッションを切り替える画面を開く/u

describe("セッションの切り替え", () => {
  it("札で開き、↓ で選んで Enter で切り替えると switchSession が流れて起こし直す", async () => {
    const room = await run.open({
      scenario: "session-switch-enter",
      scene: "session-list",
      viewport: "wide",
      domRoots: ["screen-nav", "session-switcher"],
    })

    await room.waitForEvent("sessions-changed")
    await room.page.getByRole("button", { name: SESSION_TAG }).click()
    const search = room.page.getByRole("combobox", { name: "セッションを探す" })
    await search.waitFor()
    await search.press("ArrowDown")
    await search.press("Enter")
    // 起こし直した代が流す一覧（fake driver なので空）を待つ。
    await room.waitForEvent("sessions-changed", 2)
    await room.settleAndMatch(ELAPSED_MS)
  })
})
