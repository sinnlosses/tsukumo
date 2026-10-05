import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { Locator } from "playwright-core"
import { describe, expect, it } from "vitest"

import { PROJECT_SETTINGS_PATH } from "../../src/shared/repository/project-settings.ts"
import { useScenarioRun, type ScenarioRoom } from "./scenario-run.ts"
import {
  openProjectSettingsRoom,
  openTaskListRoom,
  openTaskListRoomWithRunningTask,
} from "./task-room.ts"

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("タスクの一覧", () => {
  it("Beads の課題を読み、サイドバーのタスク一覧に並ぶ", async () => {
    const room = await openTaskListRoom(run, "task-list", ["task-section"])
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("チップを押すとその状態だけに絞り、選んだチップにだけ aria-pressed が付く", async () => {
    const room = await openTaskListRoom(run, "task-list-filtered", ["task-section"])
    await room.page.getByRole("button", { name: "未着手 1" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("選んでいるチップをもう一度押しても変わらない", async () => {
    const room = await openTaskListRoom(run, "task-list-filtered-off", ["task-section"])
    const chip = room.page.getByRole("button", { name: "未着手 1" })
    await chip.click()
    await chip.click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("「すべて」を押すと絞り込みが外れる", async () => {
    const room = await openTaskListRoom(run, "task-list-filtered-all", ["task-section"])
    await room.page.getByRole("button", { name: "未着手 1" }).click()
    await room.page.getByRole("button", { name: "すべて 2" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("別のチップを押すと絞り込みが切り替わる", async () => {
    const room = await openTaskListRoom(run, "task-list-filtered-switched", ["task-section"])
    await room.page.getByRole("button", { name: "未着手 1" }).click()
    await room.page.getByRole("button", { name: "完了 1" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("着手中の課題は進行中のカードで先頭に出て、残りは ID の順のまま並ぶ", async () => {
    const room = await openTaskListRoomWithRunningTask(
      run,
      "task-list-running",
      ["task-section"],
      "wide",
    )
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("行を押すと、状態・ID・題・本文の頭・「全文を開く」を持つのぞき窓が開く", async () => {
    const room = await openTaskListRoom(run, "task-list-peek", ["task-section"])
    await taskRow(room, "T-001").click()
    const peek = taskPeek(room, "T-001")
    await peek.waitFor()

    const text = await peek.textContent()
    expect(text).not.toContain("作った")
    expect(text).not.toContain("担当")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("進行中のカードを押しても、のぞき窓が開く", async () => {
    const room = await openTaskListRoomWithRunningTask(
      run,
      "task-list-peek-running",
      ["task-section"],
      "wide",
    )
    await taskRow(room, "T-003").click()
    await taskPeek(room, "T-003").waitFor()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("のぞき窓を開いたまま ↓ を押すと、隣の行へ移って中身が入れ替わる", async () => {
    const room = await openTaskListRoom(run, "task-list-peek-arrow", ["task-section"])
    await taskRow(room, "T-001").click()
    await room.page.keyboard.press("ArrowDown")
    await taskPeek(room, "T-002").waitFor()

    expect(await focusedId(room)).toBe("task-row-T-002")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("のぞき窓は Esc で閉じ、押した行へフォーカスが戻る", async () => {
    const room = await openTaskListRoom(run, "task-list-peek-escape", ["task-section"])
    await taskRow(room, "T-001").click()
    await taskPeek(room, "T-001").waitFor()
    await room.page.keyboard.press("Escape")
    await taskPeek(room, "T-001").waitFor({ state: "detached" })

    expect(await focusedId(room)).toBe("task-row-T-001")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("「全文を開く」で、タスクのモーダルがそのタスクを選んだ状態で開く", async () => {
    const room = await openTaskListRoom(run, "task-list-peek-open-full", [
      "task-section",
      "task-board",
    ])
    await taskRow(room, "T-002").click()
    await room.page.getByRole("button", { name: "全文を開く ↗", exact: true }).click()
    await room.page.getByRole("dialog", { name: "タスク" }).waitFor()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("のぞき窓の「これを始める」を押すと実行の確認が開く", async () => {
    const room = await openTaskListRoom(run, "task-list-run-confirm", [
      "task-section",
      "task-run-confirm",
    ])
    await startFromPeek(room, "T-001")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("済んだタスクののぞき窓には「これを始める」を出さない", async () => {
    const room = await openTaskListRoom(run, "task-list-run-done", ["task-section"])
    await taskRow(room, "T-002").click()
    await taskPeek(room, "T-002").waitFor()
    expect(await room.page.getByRole("button", { name: "これを始める →" }).count()).toBe(0)
  })

  it("確認の「実行する」を押すと /next-task <ID> が送られて確認とのぞき窓が閉じる", async () => {
    const room = await openTaskListRoom(run, "task-list-run-executed", [
      "task-section",
      "task-run-confirm",
    ])
    await startFromPeek(room, "T-001")
    await room.page.getByRole("button", { name: "実行する", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("確認の「キャンセル」を押すと何も送らず確認だけ閉じる", async () => {
    const room = await openTaskListRoom(run, "task-list-run-cancel", [
      "task-section",
      "task-run-confirm",
    ])
    await startFromPeek(room, "T-001")
    await room.page.getByRole("button", { name: "キャンセル", exact: true }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("確認を Esc で閉じても何も送らず、のぞき窓は残る", async () => {
    const room = await openTaskListRoom(run, "task-list-run-escape", [
      "task-section",
      "task-run-confirm",
    ])
    await startFromPeek(room, "T-001")
    await room.page.keyboard.press("Escape")
    await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor({ state: "detached" })
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("設定も .beads も無いと、タスクの節に「不明」を出し、見出しに歯車は無い", async () => {
    const room = await run.open({
      scenario: "task-list-no-beads",
      scene: "none",
      viewport: "wide",
      domRoots: ["sidebar"],
    })
    const { page } = room
    const section = page.locator('section[aria-label="タスク"]')
    await section.getByText("不明", { exact: true }).waitFor()

    expect(await section.getByRole("button", { name: "プロジェクトの設定" }).count()).toBe(0)
    await room.settleAndMatch(ELAPSED_MS)
  })

  it(".beads が無いと、柱の口に進行中の件数を出さない", async () => {
    const room = await run.open({
      scenario: "task-list-no-beads-rail",
      scene: "none",
      viewport: "medium",
      domRoots: [],
    })
    const toggle = room.page.getByRole("button", { name: "サイドバー", exact: true })
    await toggle.click()
    await room.page.getByText("不明", { exact: true }).waitFor()

    expect(await toggle.textContent()).not.toMatch(/\d/)
  })
})

describe("プロジェクトの設定を画面から書く", () => {
  it("設定が無くても一覧が出て、帯の歯車から書くダイアログが開き、下書きの値が並ぶ", async () => {
    const room = await openProjectSettingsRoom(
      run,
      "project-settings-open",
      ["sidebar", "project-settings"],
      "missing",
    )
    await openProjectSettingsFromGear(room)
    const dialog = await projectSettingsDialog(room)

    expect(await dialog.getByLabel("主ブランチ").inputValue()).toBe("main")
    expect(await dialog.getByLabel("頼む文面").inputValue()).toBe("/next-task {id}")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("保存すると .tsukumo/project.json に書かれ、頼む文面が一覧に届く", async () => {
    const room = await openProjectSettingsRoom(run, "project-settings-save", [], "missing")
    await openProjectSettingsFromGear(room)
    const dialog = await projectSettingsDialog(room)
    await dialog.getByLabel("頼む文面").fill("/work {id}")
    await dialog.getByRole("button", { name: "保存" }).click()

    await room.waitForEvent("tasks-changed", 2)
    expect(readProjectSettingsFile(room)).toEqual({
      tasks: { mainBranch: "main", runPrompt: "/work {id}" },
    })
  })

  it("設定が読めないと、帯の歯車から開いた保存の前に上書きを確かめる", async () => {
    const room = await openProjectSettingsRoom(run, "project-settings-overwrite", [], "invalid")
    await room.page.getByText("⚠ 読めない", { exact: true }).waitFor()
    await openProjectSettingsFromGear(room)
    const dialog = await projectSettingsDialog(room)
    await dialog.getByText("読めない", { exact: true }).waitFor()
    await dialog.getByRole("button", { name: "保存" }).click()
    const confirm = dialog.getByRole("group", { name: "上書きする？" })
    await confirm.waitFor()

    expect(readFileSync(join(room.cwd, PROJECT_SETTINGS_PATH), "utf8")).toBe("{")
    await confirm.getByRole("button", { name: "上書き" }).click()
    await room.waitForTasksContaining(["T-001"])
    expect(readProjectSettingsFile(room)).toEqual({
      tasks: { mainBranch: "main", runPrompt: "/next-task {id}" },
    })
  })

  it("「使わない」と書いたプロジェクトでは、サイドバーにタスクの節が出ず、歯車で「使う」を選ぶと書くダイアログが開く", async () => {
    const room = await openProjectSettingsRoom(
      run,
      "project-settings-off",
      ["sidebar", "project-settings"],
      "off",
    )
    expect(await room.page.locator('section[aria-label="タスク"]').count()).toBe(0)

    await openGear(room)
    await room.page.getByLabel("タスク運用の使う・使わない").selectOption("use")
    await projectSettingsDialog(room)
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("歯車で「使わない」を選ぶと .tsukumo/project.json に off が書かれ、タスクの節が消える", async () => {
    const room = await openProjectSettingsRoom(run, "project-settings-turn-off", [], "missing")
    await openGear(room)
    await room.page.getByLabel("タスク運用の使う・使わない").selectOption("off")

    await room.page.locator('section[aria-label="タスク"]').waitFor({ state: "detached" })
    expect(readProjectSettingsFile(room)).toEqual({ tasks: "off" })
  })
})

/** 帯の右端の歯車を押して、ポップオーバーを開く。 */
async function openGear(room: ScenarioRoom): Promise<void> {
  await room.page.locator('nav[aria-label="画面"] > div > button[aria-label="設定"]').click()
}

/** 歯車のポップオーバーの「プロジェクトの設定を開く」から、ダイアログを開く。 */
async function openProjectSettingsFromGear(room: ScenarioRoom): Promise<void> {
  await openGear(room)
  await room.page.getByRole("button", { name: "プロジェクトの設定を開く" }).click()
}

/** 時計を進める1回ぶんと、進める回数の上限（合わせて 1 秒）。 */
const CLOCK_STEP_MS = 50
const CLOCK_STEPS = 20

/**
 * ダイアログを返す。下書きは手続き（`/rpc`）の応答で届き、React Query はその知らせをタイマーで配るので、
 * 欄が描かれるまで凍らせた時計を少しずつ進める。
 */
async function projectSettingsDialog(room: ScenarioRoom): Promise<Locator> {
  const dialog = room.page.getByRole("dialog", { name: "プロジェクトの設定" })
  const field = dialog.getByLabel("主ブランチ")
  for (let step = 0; step < CLOCK_STEPS && !(await field.isVisible()); step += 1) {
    await room.page.clock.runFor(CLOCK_STEP_MS)
  }
  await field.waitFor()
  return dialog
}

function readProjectSettingsFile(room: ScenarioRoom): unknown {
  return JSON.parse(readFileSync(join(room.cwd, PROJECT_SETTINGS_PATH), "utf8"))
}

/** 区画の行（進行中のカード）のボタン。名前は ID と題をつないだものになるので、DOM の id で当てる。 */
function taskRow(room: ScenarioRoom, id: string): Locator {
  return room.page.locator(`#task-row-${id}`)
}

function taskPeek(room: ScenarioRoom, id: string): Locator {
  return room.page.getByRole("dialog", { name: `${id} の詳細` })
}

async function startFromPeek(room: ScenarioRoom, id: string): Promise<void> {
  await taskRow(room, id).click()
  await room.page.getByRole("button", { name: "これを始める →", exact: true }).click()
  await room.page.getByRole("dialog", { name: "タスクの実行" }).waitFor()
}

async function focusedId(room: ScenarioRoom): Promise<string> {
  return room.page.evaluate(() => document.activeElement?.id ?? "")
}
