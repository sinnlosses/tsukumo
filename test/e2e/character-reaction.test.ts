import type { Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { READY_TASK_ID, writeWelcomeTasks } from "./task-room.ts"

// 機械の出来事 → キャラビューの反応の吹き出し（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面が流す反応の行（`reactions-written`）の架空の行が、`data-reaction` の付いた吹き出しとして最新の位置に出る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** ターンが閉じてから待ちの一言を出すまでの間（`WAITING_LINE_DELAY_MS`）。 */
const WAITING_LINE_DELAY_MS = 120_000

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
    await room.settleAndMatchPicked(ELAPSED_MS)
    expect(await character.locator('[data-writing="true"]').count()).toBe(0)
  })

  it("Claude Code が待ちの一言を書いていなければ、反応の行の問い合わせが書いた待ちの行が出る", async () => {
    const room = await run.open({
      scenario: "character-reaction-waiting-idle",
      scene: "waiting-idle",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(WAITING_ELAPSED_MS)
  })

  it("表示した迎えの挨拶がサーバへ渡り、札が後から決まっても `/clear` のあとも、ログには吹き出しと同じ文が1件だけ残る", async () => {
    const room = await run.open({
      scenario: "character-reaction-welcome-greeting",
      scene: "welcome-greeting",
      viewport: "wide",
      domRoots: ["character"],
    })
    const character = room.page.locator('[data-region="character"]')
    const latestBalloon = character.locator('[data-latest="true"]')

    await room.waitForEvent("welcome-greeting-shown")
    await expectOneLoggedLine(room.page, "架空の挨拶。")

    await writeWelcomeTasks(room)
    await room.waitForEvent("welcome-greeting-shown", 2)
    await latestBalloon.getByText(`架空の挨拶、${READY_TASK_ID} からどう？`).waitFor()
    await expectOneLoggedLine(room.page, `架空の挨拶、${READY_TASK_ID} からどう？`)

    const textArea = room.page.locator("textarea")
    await textArea.fill("会話を消して始め直す（架空の依頼）")
    await textArea.press("Meta+Enter")
    await room.waitForEvent("welcome-greeting-shown", 3)
    await latestBalloon.getByText(`架空の書き直した挨拶、${READY_TASK_ID} はどう？`).waitFor()
    await expectOneLoggedLine(room.page, `架空の書き直した挨拶、${READY_TASK_ID} はどう？`)
    await room.settleAndMatchWithMessages(ELAPSED_MS)
  })
})

/** 吹き出しの最新の1件が `text` で、セリフのログにも同じ文と時刻の1件だけが並ぶ。 */
async function expectOneLoggedLine(page: Page, text: string): Promise<void> {
  const [balloon, log] = await balloonAndLog(page)
  expect(balloon.startsWith(`${text}@`) && !balloon.endsWith("@-")).toBe(true)
  expect(log).toEqual([balloon])
}

/**
 * 吹き出しの最新の1件と、セリフのログを開いて並ぶセリフを、どちらも `文@時刻` で並べる（開いたログは閉じる）。
 * 時刻は `<time>` の `dateTime`。
 */
async function balloonAndLog(page: Page): Promise<readonly [string, readonly string[]]> {
  const character = page.locator('[data-region="character"]')
  const balloon = await character
    .locator('[data-latest="true"]')
    .evaluate(
      (element) =>
        `${element.querySelector('[class*="balloon-text"]')?.textContent ?? ""}@${element.querySelector("time")?.getAttribute("datetime") ?? "-"}`,
    )
  await character.getByRole("button", { name: "ログ", exact: true }).click()
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
