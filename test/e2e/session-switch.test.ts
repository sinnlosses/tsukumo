import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

import { TSUKUMO_HOME_PLACES } from "../../src/server/adapter/tsukumo-home.ts"
import { expect, test } from "./room-fixture.ts"
import { sessionMenu, sessionMenuOpener } from "./session-menu.ts"

// 部屋の頭のセッションの一覧（docs/architecture/testing.md「E2E のシナリオの一覧」）。fake driver は claude を
// 起こさないので切り替え先の一覧を持たない。疑似セッションの場面 `session-list` が作り物の一覧を
// `sessions-changed` で流す。一覧が届くのを待ってから部屋の名前を押す（場面が流れ終わるのを時間で待たない）。
// 一覧の行の並びは、いまの作業ツリーの4件（先頭がいま開いているもの）・「＋ 新しく始める」・ほかの作業ツリーの2件。

/** 撮るときの経過（凍らせた瞬間から）。 */
const ELAPSED_MS = 60_000

/** 場面 `session-list` の2行目（7B）のセッションのID。 */
const OCCUPIED_SESSION_ID = "7b3f0000-0000-4000-8000-000000000001"

test.describe("セッションの切り替え", () => {
  test("部屋の名前で開き、↓ で選んで Enter で切り替えると switchSession が流れて起こし直す", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "session-switch-enter",
      scene: "session-list",
      viewport: "wide",
      domRoots: ["sidebar"],
    })

    await room.waitForEvent("sessions-changed")
    await sessionMenuOpener(room.page).click()
    const menu = sessionMenu(room.page)
    const current = menu.locator('button[aria-current="true"]')
    await current.focus()
    await room.page.keyboard.press("ArrowDown")
    expect(
      await menu.evaluate((element) => element.ownerDocument.activeElement?.textContent ?? ""),
    ).toContain("架空の成果の画面に振り返りの口を置きたい")
    await room.page.keyboard.press("Enter")
    // 起こし直した代が流す一覧（fake driver なので空）を待つ。
    await room.waitForEvent("sessions-changed", 2)
    expect(await menu.count()).toBe(0)
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })

  // 別のウィンドウの tsukumo の占有ファイルは、このテストのプロセス（生きている）が書いたことにする。
  test("別のウィンドウが占有ファイルに書いているセッションの行は押せず、↑↓ も飛ばす", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "session-switch-occupied",
      scene: "session-list",
      viewport: "wide",
      domRoots: ["session-menu"],
    })
    await room.waitForEvent("sessions-changed")
    const claimDir = path.join(room.home, TSUKUMO_HOME_PLACES.sessionClaim)
    mkdirSync(claimDir, { recursive: true })
    writeFileSync(
      path.join(claimDir, `${String(process.pid)}.json`),
      JSON.stringify({ pid: process.pid, sessionIds: [OCCUPIED_SESSION_ID] }),
    )

    const menu = sessionMenu(room.page)
    const occupied = menu.getByRole("button", { name: /別のウィンドウで使用中/u })
    // 時計が止まっているので、使用中の応答を React Query が配るのに要るタイマーは応答のあとで進める。
    await room.revealAfterResponse(occupied, {
      response: "sessionClaim/occupied",
      baseline: {
        kind: "after-act",
        act: () => sessionMenuOpener(room.page).click(),
      },
    })
    expect(await occupied.isDisabled()).toBe(true)

    const focused = (): Promise<string> =>
      menu.evaluate((element) => element.ownerDocument.activeElement?.textContent ?? "")
    await menu.locator('button[aria-current="true"]').focus()
    await room.page.keyboard.press("ArrowDown")
    expect(await focused()).toContain("/retrospect")
    await room.page.keyboard.press("ArrowUp")
    expect(await focused()).toContain("入力欄の送信ボタンの位置を架空に直す")

    await room.settleAndMatchPicked(ELAPSED_MS)
  })
})
