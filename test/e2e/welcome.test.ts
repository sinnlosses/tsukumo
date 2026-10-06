import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { BLOCKED_TASK_ID, READY_TASK_ID, writeWelcomeTasks } from "./task-room.ts"

// 依頼前のメインビューの迎える口（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 札の並びと理由は疑似セッションの場面 `welcome-recommendation`、続きの要約は `sessionDigests`、タスクは cwd の `FAKE_BEADS_ISSUES_PATH` に架空の課題を置いて用意する。
// 要約は手続き（`/rpc`）の応答で届くので、描かれるまで凍らせた時計を少しずつ進める。

const run = useScenarioRun()

const ELAPSED_MS = 60_000
const CLOCK_STEP_MS = 50
const CLOCK_STEPS = 40

const RESUME_CARD = "架空の成果の画面に振り返りの口を置きたい"
const READY_CARD = new RegExp(`${READY_TASK_ID} を始める`)

async function advanceUntil(page: Page, done: () => Promise<boolean>): Promise<void> {
  for (let step = 0; step < CLOCK_STEPS; step += 1) {
    if (await done()) {
      return
    }
    await page.clock.runFor(CLOCK_STEP_MS)
  }
  expect(await done()).toBe(true)
}

async function openWelcomeRoom(scenario: string, viewport: "wide" | "medium") {
  const room = await run.open({
    scenario,
    scene: "welcome-recommendation",
    viewport,
    domRoots: ["main"],
  })
  await writeWelcomeTasks(room)
  await room.waitForEvent("sessions-changed")
  const resume = mainView(room.page).getByRole("button", { name: new RegExp(RESUME_CARD) })
  await advanceUntil(room.page, () => resume.isVisible())
  return room
}

function mainView(page: Page): Locator {
  return page.locator('[data-region="main"]')
}

function welcome(page: Page): Locator {
  return page.locator('[data-main-view-content="welcome"]')
}

function draft(page: Page): Promise<string> {
  return page.locator("textarea").inputValue()
}

describe("迎える口", () => {
  it.each(["wide", "medium"] as const)(
    "理由つきのおすすめの札と「ほかの始め方」が並ぶ（%s）",
    async (viewport) => {
      const room = await openWelcomeRoom(`welcome-doors-${viewport}`, viewport)
      const page = room.page
      await mainView(page).getByRole("button", { name: READY_CARD }).waitFor()
      expect(
        await mainView(page)
          .getByRole("button", { name: new RegExp(BLOCKED_TASK_ID) })
          .count(),
      ).toBe(0)
      expect(await welcome(page).locator("ul > li").count()).toBe(2)
      expect(await welcome(page).getByText("いちばんのおすすめ").count()).toBe(1)
      for (const name of ["自分で書く", "タスクの一覧から選ぶ", "前のやり取りを見る"]) {
        expect(await mainView(page).getByRole("button", { name }).count()).toBe(1)
      }
      const overflow = await mainView(page).evaluate((el) => el.scrollWidth - el.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      await room.settleAndMatch(ELAPSED_MS)
    },
  )

  it("「始める」を押すと、入力欄を経由せず依頼が送られ、下書きは残る", async () => {
    const room = await openWelcomeRoom("welcome-start-button", "wide")
    await room.page.locator("textarea").fill("打ちかけの架空の依頼")
    await mainView(room.page).getByRole("button", { name: READY_CARD }).click()
    await room.waitForEvent("request")
    expect(await draft(room.page)).toBe("打ちかけの架空の依頼")
  })
})
