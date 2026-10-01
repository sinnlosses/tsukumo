import type { Locator, Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { BLOCKED_TASK_ID, READY_TASK_ID, writeWelcomeTasks } from "./task-room.ts"

// 依頼前のメインビューの迎える口（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 続きは疑似セッションの場面 `session-list`（前回のセッションの要約は `sessionDigests`）、タスクは cwd の develop/task/ を手書きして用意する。
// 要約は手続き（`/rpc`）の応答で届くので、描かれるまで凍らせた時計を少しずつ進める。

const run = useScenarioRun()

const ELAPSED_MS = 60_000
const CLOCK_STEP_MS = 50
const CLOCK_STEPS = 20

const RESUME_DOOR = "架空の成果の画面に振り返りの口を置きたい"
const RESUME_REQUEST = "前回の続き: 数が0の日の見せ方は、次のセッションで決める。"
const TASK_REQUEST = `${READY_TASK_ID} に着手して`

async function revealDoors(page: Page): Promise<void> {
  const door = mainView(page).getByRole("button", { name: new RegExp(RESUME_DOOR) })
  for (let step = 0; step < CLOCK_STEPS; step += 1) {
    if (await door.isVisible()) {
      return
    }
    await page.clock.runFor(CLOCK_STEP_MS)
  }
  await door.waitFor()
}

async function openWelcomeRoom(scenario: string, viewport: "wide" | "medium") {
  const room = await run.open({ scenario, scene: "session-list", viewport, domRoots: ["main"] })
  await writeWelcomeTasks(room)
  await room.waitForEvent("sessions-changed")
  await revealDoors(room.page)
  return room
}

function mainView(page: Page): Locator {
  return page.locator('[data-region="main"]')
}

function draft(page: Page): Promise<string> {
  return page.locator("textarea").inputValue()
}

describe("迎える口", () => {
  it.each(["wide", "medium"] as const)(
    "前回の続きと着手できるタスクだけが口になって並ぶ（%s）",
    async (viewport) => {
      const room = await openWelcomeRoom(`welcome-doors-${viewport}`, viewport)
      await mainView(room.page)
        .getByRole("button", { name: new RegExp(READY_TASK_ID) })
        .waitFor()
      expect(
        await mainView(room.page)
          .getByRole("button", { name: new RegExp(BLOCKED_TASK_ID) })
          .count(),
      ).toBe(0)
      const overflow = await mainView(room.page).evaluate((el) => el.scrollWidth - el.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      await room.settleAndMatch(ELAPSED_MS)
    },
  )

  it("タスクの口を押すと入力欄に依頼が入り、送られない", async () => {
    const room = await openWelcomeRoom("welcome-task-door", "wide")
    await mainView(room.page)
      .getByRole("button", { name: new RegExp(READY_TASK_ID) })
      .click()
    expect(await draft(room.page)).toBe(TASK_REQUEST)
    expect(await room.page.locator('[data-main-view-content="welcome"]').count()).toBe(1)
  })

  it("続けて続きの口を押すと、改行を挟んで末尾に足される", async () => {
    const room = await openWelcomeRoom("welcome-door-append", "wide")
    await mainView(room.page)
      .getByRole("button", { name: new RegExp(READY_TASK_ID) })
      .click()
    await mainView(room.page)
      .getByRole("button", { name: new RegExp(RESUME_DOOR) })
      .click()
    expect(await draft(room.page)).toBe(`${TASK_REQUEST}\n${RESUME_REQUEST}`)
  })

  it("打ちかけの字があっても上書きされない", async () => {
    const room = await openWelcomeRoom("welcome-door-keeps-draft", "wide")
    await room.page.locator("textarea").fill("打ちかけの架空の依頼")
    await mainView(room.page)
      .getByRole("button", { name: new RegExp(READY_TASK_ID) })
      .click()
    expect(await draft(room.page)).toBe(`打ちかけの架空の依頼\n${TASK_REQUEST}`)
  })

  it("空の帳面（タスク0件・続き無し）でも、見出しと1行だけが出て口は出ない", async () => {
    const room = await run.open({
      scenario: "welcome-empty",
      scene: "none",
      viewport: "wide",
      domRoots: ["main"],
    })
    await room.page.getByRole("heading", { name: "何から始める？" }).waitFor()
    expect(
      await mainView(room.page).locator('[data-main-view-content="welcome"] button').count(),
    ).toBe(0)
    await room.settleAndMatch(ELAPSED_MS)
  })
})
