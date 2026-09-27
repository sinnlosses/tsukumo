import type { Page } from "playwright-core"
import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// セッションの札と切り替え画面（docs/design.md「E2E のシナリオの一覧」）。fake driver は claude を
// 起こさないので切り替え先の一覧を持たない。疑似セッションの場面 `session-list` が作り物の一覧を
// `sessions-changed` で流し、右の欄の中身は疑似セッションの `sessionDigests` から返る。
// 一覧が届くのを待ってから札を押す（場面が流れ終わるのを時間で待たない）。
//
// 右の欄の中身は手続き（`/rpc`）の応答で届き、React Query はその知らせをタイマーで配るので、
// ブラウザの時計を凍らせたままだと描かれない。届くまで時計を少しずつ進める（`revealDigest`）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。 */
const ELAPSED_MS = 60_000

/** 札の読み上げの名前（部屋の名前・短縮ID・押すと何が起きるか）。 */
const SESSION_TAG = /セッション FA。押すとセッションを切り替える画面を開く/u

/** 時計を進める1回ぶんと、進める回数の上限（合わせて 1 秒）。 */
const CLOCK_STEP_MS = 50
const CLOCK_STEPS = 20

/** 右の欄の要約が描かれるまで、凍らせた時計を少しずつ進める。 */
async function revealDigest(page: Page): Promise<void> {
  const heading = page.getByText("このセッションの要約")
  for (let step = 0; step < CLOCK_STEPS; step += 1) {
    if (await heading.isVisible()) {
      return
    }
    await page.clock.runFor(CLOCK_STEP_MS)
  }
  await heading.waitFor()
}

describe("セッションの切り替え", () => {
  it("札を押すと切り替え画面が開き、選んでいるセッションの要約と最後のひとことが出る", async () => {
    const room = await run.open({
      scenario: "session-switch-open",
      scene: "session-list",
      viewport: "wide",
    })

    await room.waitForEvent("sessions-changed")
    await room.page.getByRole("button", { name: SESSION_TAG }).click()
    await revealDigest(room.page)
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("札で開き、↓ で選んで Enter で切り替えると switchSession が流れて起こし直す", async () => {
    const room = await run.open({
      scenario: "session-switch-enter",
      scene: "session-list",
      viewport: "wide",
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

  it("狭い画面では「≡」の面の先頭の札から同じ切り替え画面が開く", async () => {
    const room = await run.open({
      scenario: "session-switch-narrow",
      scene: "session-list",
      viewport: "narrow",
    })

    await room.waitForEvent("sessions-changed")
    await room.page.getByRole("button", { name: "メニュー" }).click()
    await room.page.getByRole("button", { name: SESSION_TAG }).filter({ visible: true }).click()
    await revealDigest(room.page)
    await room.settleAndMatch(ELAPSED_MS)
  })
})
