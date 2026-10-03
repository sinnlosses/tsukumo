import type { Page } from "playwright-core"
import { describe, expect, it } from "vitest"

import { scanReadability } from "./readability-scan.ts"
import { useScenarioRun } from "./scenario-run.ts"
import { openTaskListRoomWithRunningTask } from "./task-room.ts"

// 会話の画面の押せるものが 24x24 以上で名前を持ち、字が 12px 以上・4.5:1 以上であること
// （docs/architecture/testing.md「E2E のシナリオの一覧」）。期待値は撮らず、割れたものの名前と寸法を差分に出す。

const run = useScenarioRun()

const LONG_TOOL_OCCURRENCE = 4

async function expectReadable(page: Page): Promise<void> {
  expect(await scanReadability(page)).toEqual({
    smallTargets: [],
    unnamedControls: [],
    smallText: [],
    lowContrastText: [],
  })
}

describe("会話の画面の押す的と字", () => {
  it.each(["large", "medium"] as const)(
    "迎える画面とサイドバーの押せるもの・字が下限を割らない（%s）",
    async (viewport) => {
      const room = await openTaskListRoomWithRunningTask(
        run,
        `target-size-welcome-${viewport}`,
        [],
        viewport,
      )
      if (viewport === "medium") {
        await room.page.getByRole("button", { name: "サイドバー", exact: true }).click()
      }
      await room.page.locator('[data-region="sidebar"]').waitFor()
      await expectReadable(room.page)
    },
  )

  it.each(["large", "medium"] as const)(
    "お伺いで選択肢を選んだあとの押せるもの・字が下限を割らない（%s）",
    async (viewport) => {
      const room = await run.open({
        scenario: `target-size-inquiry-${viewport}`,
        scene: "question-multi",
        viewport,
        domRoots: [],
      })
      await room.waitForEvent("turn-finished")
      await room.page.getByRole("checkbox").first().check()
      const answer = room.page.getByRole("button", { name: /これで答える/ })
      await expect.poll(() => answer.getAttribute("aria-disabled")).not.toBe("true")
      await expectReadable(room.page)
    },
  )

  it("失敗の塊の押せるもの・字が下限を割らない", async () => {
    const room = await run.open({
      scenario: "target-size-failure",
      scene: "api-failure",
      viewport: "medium",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    await room.page.getByRole("button", { name: "同じ依頼を入力欄に戻す" }).waitFor()
    await expectReadable(room.page)
  })

  it("過去のやり取りを見るときの知らせの行の口が下限を割らない", async () => {
    const room = await run.open({
      scenario: "target-size-head-notice",
      scene: "turn-history",
      viewport: "large",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished", 4)
    await room.page.getByRole("button", { name: "1つ古いターンへ" }).click()
    await room.page.getByRole("button", { name: "最新へ" }).waitFor()
    await expectReadable(room.page)
  })

  it("進み具合の帯の手順の口が下限を割らない", async () => {
    const room = await run.open({
      scenario: "target-size-work-strip",
      scene: "work-strip-running",
      viewport: "medium",
      domRoots: [],
    })
    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    await room.page.getByRole("button", { name: /手順/ }).waitFor()
    await expectReadable(room.page)
  })

  it.each([
    ["notation", "notation"],
    ["work-plan", "work-plan-quick"],
  ] as const)("レポートの記法と段取りの字が下限を割らない（%s）", async (name, scene) => {
    const room = await run.open({
      scenario: `target-size-report-${name}`,
      scene,
      viewport: "large",
      domRoots: [],
    })
    await room.waitForEvent("turn-finished")
    await expectReadable(room.page)
  })
})
