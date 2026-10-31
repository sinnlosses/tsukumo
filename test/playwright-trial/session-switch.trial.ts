import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

import { TSUKUMO_HOME_PLACES } from "../../src/server/adapter/tsukumo-home.ts"
import { expect, test } from "./room-fixture.ts"

// openRoom が context の trace を自分で始めるので、設定側の trace は切る
test.use({ trace: "off" })

const ELAPSED_MS = 60_000
const SESSION_TAG = /セッション FA。押すとセッションを切り替える画面を開く/u
const OCCUPIED_SESSION_ID = "7b3f0000-0000-4000-8000-000000000001"

test("札で開き、↓ で選んで Enter で切り替えると switchSession が流れて起こし直す", async ({
  run,
}) => {
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
  await room.waitForEvent("sessions-changed", 2)
  expect(await room.page.getByRole("dialog", { name: "セッションを切り替える" }).count()).toBe(0)
  await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
})

test("別の窓が占有ファイルに書いているセッションの行は選べず、開いた直後の選びも ↑↓ も飛ばす", async ({
  run,
}) => {
  const room = await run.open({
    scenario: "session-switch-occupied",
    scene: "session-list",
    viewport: "wide",
    domRoots: ["session-switcher"],
  })
  await room.waitForEvent("sessions-changed")
  const claimDir = path.join(room.home, TSUKUMO_HOME_PLACES.sessionClaim)
  mkdirSync(claimDir, { recursive: true })
  writeFileSync(
    path.join(claimDir, `${String(process.pid)}.json`),
    JSON.stringify({ pid: process.pid, sessionIds: [OCCUPIED_SESSION_ID] }),
  )

  const list = room.page.getByRole("listbox", { name: "セッション" })
  const occupied = list.getByRole("option", { name: /別の窓で使用中/u })
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

  await room.settleAndMatchPicked(ELAPSED_MS)
})
