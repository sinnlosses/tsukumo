import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

import { describe, expect, it } from "vitest"

import { SESSION_CLAIM_DIR_NAME } from "../../src/server/session-driver/adapter/session-claim-file.ts"
import { useScenarioRun } from "./scenario-run.ts"

// セッションの札と切り替え画面（docs/architecture/testing.md「E2E のシナリオの一覧」）。fake driver は claude を
// 起こさないので切り替え先の一覧を持たない。疑似セッションの場面 `session-list` が作り物の一覧を
// `sessions-changed` で流す。一覧が届くのを待ってから札を押す（場面が流れ終わるのを時間で待たない）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。 */
const ELAPSED_MS = 60_000

/** 札の読み上げの名前（部屋の名前・短縮ID・押すと何が起きるか）。 */
const SESSION_TAG = /セッション FA。押すとセッションを切り替える画面を開く/u

/** 場面 `session-list` の2行目（7B）のセッションのID。 */
const OCCUPIED_SESSION_ID = "7b3f0000-0000-4000-8000-000000000001"

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

  // 別の窓の tsukumo の名乗りは、このテストのプロセス（生きている）が書いたことにする。
  it("別の窓が名乗っているセッションの行は選べず、開いた直後の選びも ↑↓ も飛ばす", async () => {
    const room = await run.open({
      scenario: "session-switch-occupied",
      scene: "session-list",
      viewport: "wide",
      domRoots: ["session-switcher"],
    })
    await room.waitForEvent("sessions-changed")
    const claimDir = path.join(room.home, SESSION_CLAIM_DIR_NAME)
    mkdirSync(claimDir, { recursive: true })
    writeFileSync(
      path.join(claimDir, `${String(process.pid)}.json`),
      JSON.stringify({ pid: process.pid, sessionIds: [OCCUPIED_SESSION_ID] }),
    )

    const list = room.page.getByRole("listbox", { name: "セッション" })
    const occupied = list.getByRole("option", { name: /別の窓で使用中/u })
    // 時計が止まっているので、使用中の応答を React Query が配るのに要るタイマーは応答のあとで進める。
    await room.revealAfterResponse(occupied, {
      response: "sessionClaim/occupied",
      baseline: {
        kind: "after-act",
        act: () => room.page.getByRole("button", { name: SESSION_TAG }).click(),
      },
    })
    expect(await occupied.getAttribute("aria-disabled")).toBe("true")
    const selected = list.locator('[role="option"][aria-selected="true"]')
    expect(await selected.innerText()).toContain("/retrospect")

    const search = room.page.getByRole("combobox", { name: "セッションを探す" })
    await search.press("ArrowUp")
    expect(await selected.innerText()).toContain("入力欄の送信ボタンの位置を架空に直す")
    await search.press("ArrowDown")
    expect(await selected.innerText()).toContain("/retrospect")

    await room.settleAndMatch(ELAPSED_MS)
  })
})
