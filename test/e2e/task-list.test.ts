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

/** 帯の右端の歯車から、プロジェクトの設定のダイアログを開いて返す。下書きの欄は手続き（`/rpc`）の応答で描かれる。 */
async function openProjectSettingsDialog(room: ScenarioRoom): Promise<Locator> {
  const dialog = room.page.getByRole("dialog", { name: "プロジェクトの設定" })
  await room.revealAfterResponse(dialog.getByLabel("主ブランチ"), {
    response: "projectSettingsDraft",
    baseline: {
      kind: "after-act",
      act: async () => {
        await room.page.locator('nav[aria-label="画面"] > div > button[aria-label="設定"]').click()
        await room.page.getByRole("button", { name: "プロジェクトの設定を開く" }).click()
      },
    },
  })
  return dialog
}

/** 区画の行（進行中のカード）のボタン。名前は ID と題をつないだものになるので、DOM の id で当てる。 */
function taskRow(room: ScenarioRoom, id: string): Locator {
  return room.page.locator(`#task-row-${id}`)
}
