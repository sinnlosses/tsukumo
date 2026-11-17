import type { Page } from "playwright-core"

import { expect, test } from "./room-fixture.ts"
import { READY_TASK_ID, writeWelcomeTasks } from "./task-room.ts"

// 機械の出来事 → 狭い画面の顔の吹き出しの反応（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 広い画面のキャラビューは吹き出しを持たない（セリフは会話の流れに出る）ので、反応は狭い画面の吹き出しで確かめる。
// 場面が流す反応の行（`reactions-written`）の架空の行が、最新の1件として顔の吹き出しに出る。

/** 狭い画面の顔の吹き出し（押すとセリフのログが開く）。 */
const PHONE_BUBBLE = '[class*="phone-balloon-bubble"]'

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** ターンが閉じてから待ちの一言を出すまでの間（`WAITING_LINE_DELAY_MS`）。 */
const WAITING_LINE_DELAY_MS = 120_000

/** 依頼を待つ間の撮る経過。ターンが閉じてから待ちの一言を出すまでの間を越える。 */
const WAITING_ELAPSED_MS = WAITING_LINE_DELAY_MS + ELAPSED_MS

test.describe("機械の出来事 → キャラビューの反応", () => {
  test("送った直後は文を出さず「…」が出て、speak が届くと「…」は消えてセリフだけになる", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "character-reaction-replaced",
      scene: "reaction-accepted",
      viewport: "narrow",
      domRoots: ["character"],
    })
    const bubble = room.page.locator('[data-region="character"]').locator(PHONE_BUBBLE)

    await room.waitForEvent("request")
    await expect(bubble).toHaveText("…")

    await room.waitForEvent("turn-finished")
    await expect(bubble).not.toHaveText("…")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })

  test("Claude Code が待ちの一言を書いていなければ、反応の行の問い合わせが書いた待ちの行が出る", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "character-reaction-waiting-idle",
      scene: "waiting-idle",
      viewport: "narrow",
      domRoots: ["character"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(WAITING_ELAPSED_MS)
  })

  test("表示した迎えの挨拶がサーバへ渡り、札が後から決まっても `/clear` のあとも、ログには顔の吹き出しと同じ文が1件だけ残る", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "character-reaction-welcome-greeting",
      scene: "welcome-greeting",
      viewport: "narrow",
      domRoots: ["character"],
    })
    const character = room.page.locator('[data-region="character"]')
    const latestBalloon = character.locator(PHONE_BUBBLE)

    await room.waitForEvent("welcome-greeting-shown")
    await expectOneLoggedLine(room.page, "架空の挨拶。")

    await writeWelcomeTasks(room)
    await room.waitForEvent("welcome-greeting-shown", 2)
    await latestBalloon.getByText(`架空の挨拶、${READY_TASK_ID} からどう？`).waitFor()
    await expectOneLoggedLine(room.page, `架空の挨拶、${READY_TASK_ID} からどう？`)

    const textArea = room.page.locator("textarea")
    await textArea.fill("会話を消して始め直す（架空の依頼）")
    await textArea.press("Meta+Enter")
    await textArea.blur()
    await room.waitForEvent("welcome-greeting-shown", 3)
    await latestBalloon.getByText(`架空の書き直した挨拶、${READY_TASK_ID} はどう？`).waitFor()
    await expectOneLoggedLine(room.page, `架空の書き直した挨拶、${READY_TASK_ID} はどう？`)
    await room.settleAndMatchPickedWithMessages(ELAPSED_MS)
  })

  test("広い画面では、迎えの挨拶が入力欄の上の声の定位置に出る", async ({ run }) => {
    const room = await run.open({
      scenario: "character-reaction-welcome-greeting",
      scene: "welcome-greeting",
      viewport: "wide",
      domRoots: [],
    })

    await room.waitForEvent("welcome-greeting-shown")
    const line = room.page.locator('[data-voice-slot] [data-speaker="character"]')
    await expect(line).toContainText("架空の挨拶。")
  })
})

/** 顔の吹き出しの最新の1件が `text` で、セリフのログにも同じ文と時刻の1件だけが並ぶ。 */
async function expectOneLoggedLine(page: Page, text: string): Promise<void> {
  const [balloon, log] = await balloonAndLog(page)
  expect(balloon.startsWith(`${text}@`) && !balloon.endsWith("@-")).toBe(true)
  expect(log).toEqual([balloon])
}

/**
 * 顔の吹き出しの最新の1件と、セリフのログを開いて並ぶセリフを、どちらも `文@時刻` で並べる（開いたログは閉じる）。
 * 時刻は `<time>` の `dateTime`。
 */
async function balloonAndLog(page: Page): Promise<readonly [string, readonly string[]]> {
  const character = page.locator('[data-region="character"]')
  const bubble = character.locator(PHONE_BUBBLE)
  const text = (await bubble.textContent()) ?? ""
  const time = await character.locator("time").getAttribute("datetime")
  const balloon = `${text}@${time ?? "-"}`
  await bubble.click()
  const log = page.locator("dialog[open]")
  await log.waitFor()
  const lines = await log
    .locator('li[class*="speech-log-speech"]')
    .evaluateAll((items) =>
      items.map(
        (item) =>
          `${item.querySelector('[class*="balloon-text"]')?.textContent ?? ""}@${item.querySelector('time[class*="speech-log-speech-time"]')?.getAttribute("datetime") ?? "-"}`,
      ),
    )
  await page.keyboard.press("Escape")
  await log.waitFor({ state: "hidden" })
  return [balloon, lines]
}
