import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { Locator } from "playwright-core"
import { describe, expect, it } from "vitest"

import { PROJECT_SETTINGS_PATH } from "../../src/shared/repository/project-settings.ts"
import { useScenarioRun, type ScenarioRoom } from "./scenario-run.ts"
import { openProjectSettingsRoom, openTaskListRoom } from "./task-room.ts"

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクの一覧", () => {
  it("Beads の課題を読み、サイドバーのタスク一覧に並ぶ", async () => {
    const room = await openTaskListRoom(run, "task-list", ["task-section"])
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("のぞき窓の「これを始める」から確認の「実行する」を押すと既定の文面で依頼が送られて確認とのぞき窓が閉じる", async () => {
    const room = await openTaskListRoom(run, "task-list-run-executed", [
      "task-section",
      "task-run-confirm",
    ])
    await taskRow(room, "T-001").click()
    await room.page.getByRole("button", { name: "これを始める →", exact: true }).click()
    await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor()
    await room.page.getByRole("button", { name: "実行する", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})

describe("プロジェクトの設定を画面から書く", () => {
  it("設定が無くても帯の歯車から書くダイアログが開き、保存すると .tsukumo/project.json に書かれ、頼む文面が一覧に届く", async () => {
    const room = await openProjectSettingsRoom(run, "project-settings-save", [])
    const dialog = await openProjectSettingsDialog(room)
    await dialog.getByLabel("頼む文面").fill("/work {id}")
    await dialog.getByRole("button", { name: "保存" }).click()

    await room.waitForEvent("tasks-changed", 2)
    expect(JSON.parse(readFileSync(join(room.cwd, PROJECT_SETTINGS_PATH), "utf8"))).toEqual({
      tasks: { mainBranch: "main", runPrompt: "/work {id}" },
    })
  })
})

/** 時計を進める1回ぶんと、進める回数の上限（合わせて 1 秒）。 */
const CLOCK_STEP_MS = 50
const CLOCK_STEPS = 20

/**
 * 帯の右端の歯車から、プロジェクトの設定のダイアログを開いて返す。下書きは手続き（`/rpc`）の応答で届き、
 * React Query はその知らせをタイマーで配るので、応答が届くのを実時間で待ってから、欄が描かれるまで凍らせた時計を少しずつ進める
 * （先に時計を進め切ると、混んだ機械では応答が遅れて届いたときに欄が描かれない）。
 */
async function openProjectSettingsDialog(room: ScenarioRoom): Promise<Locator> {
  const draft = room.page.waitForResponse((response) =>
    response.url().includes("projectSettingsDraft"),
  )
  await room.page.locator('nav[aria-label="画面"] > div > button[aria-label="設定"]').click()
  await room.page.getByRole("button", { name: "プロジェクトの設定を開く" }).click()
  await draft
  const dialog = room.page.getByRole("dialog", { name: "プロジェクトの設定" })
  const field = dialog.getByLabel("主ブランチ")
  for (let step = 0; step < CLOCK_STEPS && !(await field.isVisible()); step += 1) {
    await room.page.clock.runFor(CLOCK_STEP_MS)
  }
  await field.waitFor()
  return dialog
}

/** 区画の行（進行中のカード）のボタン。名前は ID と題をつないだものになるので、DOM の id で当てる。 */
function taskRow(room: ScenarioRoom, id: string): Locator {
  return room.page.locator(`#task-row-${id}`)
}
