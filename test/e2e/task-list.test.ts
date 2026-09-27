import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, it } from "vitest"

import { claimTask, git, initGitRepository } from "../fixture/git-repository.ts"
import { type ScenarioRoom, useScenarioRun } from "./scenario-run.ts"

// タスクの一覧（docs/design.md「E2E のシナリオの一覧」）。この一覧だけは疑似セッションの
// 場面ではなく、cwd の `main` にある `develop/task/*.md` が元になる
// （読み方は `watchTaskSummary` のコメント）。足場として、一時の cwd に `git init` して `develop/task/` を
// 手書きし、`main` へコミットする。
//
// リポジトリを作るのは、`open` が部屋を渡した（ブラウザが繋がった）あとにする。
// 起こす前や繋がる前に用意すると、tsukumo の最初の見回り（起こした時点で1回走る）が
// ブラウザの `hello` に畳まれてしまい、`tasks-changed` が `events` として届かず
// `waitForEvent` の的が無くなる（10章「E2E の走らせ方」の「場面が流れ終わるのを時間で
// 待たない」と同じ理由で、待つ先は必ずイベントに置く）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** `develop/task/T-xxx.md` を1件、新形式の front matter で書く（claude-skills の
 * `docs/task-workflow-redesign.md` が正典）。会話の内容ではない架空のタスク。 */
function writeTask(
  cwd: string,
  id: string,
  summary: string,
  status: string,
  dependencies: readonly string[] = [],
): void {
  mkdirSync(join(cwd, "develop", "task"), { recursive: true })
  const content = [
    "---",
    `id: ${id}`,
    `summary: ${summary}`,
    `status: ${status}`,
    "difficulty: sonnet",
    "loopable: Y",
    `dependencies: [${dependencies.join(", ")}]`,
    "---",
    "",
    "## 目的",
    "",
    "架空の本文で、実物のタスクではない。",
    "",
  ].join("\n")
  writeFileSync(join(cwd, "develop", "task", `${id}.md`), content)
}

async function openTaskListRoom(scenario: string): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide" })

  await initGitRepository(room.cwd)
  writeTask(room.cwd, "T-001", "架空のタスク（未着手）", "todo")
  writeTask(room.cwd, "T-002", "架空のタスク（完了）", "done")
  await git(room.cwd, "add", "develop/task")
  await git(room.cwd, "commit", "--quiet", "-m", "架空のタスク一覧")

  await room.waitForEvent("tasks-changed")
  return room
}

/** 上と同じ2件に、まだ完了していないタスクに依存する `todo` を1件加える。 */
async function openTaskListRoomWithDependency(scenario: string): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide" })

  await initGitRepository(room.cwd)
  writeTask(room.cwd, "T-001", "架空のタスク（未着手）", "todo")
  writeTask(room.cwd, "T-002", "架空のタスク（完了）", "done")
  writeTask(room.cwd, "T-004", "架空のタスク（依存あり）", "todo", ["T-001"])
  await git(room.cwd, "add", "develop/task")
  await git(room.cwd, "commit", "--quiet", "-m", "架空のタスク一覧")

  await room.waitForEvent("tasks-changed")
  return room
}

/**
 * 上と同じ2件に、着手の印（`task claim` 相当）を立てた `todo` を1件加える。台帳は
 * `main` を動かさないので、コミットのあとに claim しても1回の `tasks-changed` に乗る
 * （`readTasksAtHead` が先端を読み直すたびに台帳も読むため）。
 */
async function openTaskListRoomWithRunningTask(scenario: string): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide" })

  await initGitRepository(room.cwd)
  writeTask(room.cwd, "T-001", "架空のタスク（未着手）", "todo")
  writeTask(room.cwd, "T-002", "架空のタスク（完了）", "done")
  writeTask(room.cwd, "T-003", "架空のタスク（進行中）", "todo")
  await git(room.cwd, "add", "develop/task")
  await git(room.cwd, "commit", "--quiet", "-m", "架空のタスク一覧")
  await claimTask(room.cwd, "T-003")

  await room.waitForEvent("tasks-changed")
  return room
}

describe("タスクの一覧", () => {
  it("main の develop/task/ を読み、サイドバーのタスク一覧に並ぶ", async () => {
    const room = await openTaskListRoom("task-list")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("見出しの「一覧を見る」で表が開く（依存が残るタスクは「待ち」に依存先のIDが並ぶ）", async () => {
    const room = await openTaskListRoomWithDependency("task-list-board-open")
    await room.page.getByRole("button", { name: "一覧を見る" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("チップを押すとその状態だけに絞り、選んだチップにだけ aria-pressed が付く", async () => {
    const room = await openTaskListRoom("task-list-filtered")
    await room.page.getByRole("button", { name: "未着手 1" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("選んでいるチップをもう一度押すと全件に戻る", async () => {
    const room = await openTaskListRoom("task-list-filtered-off")
    const chip = room.page.getByRole("button", { name: "未着手 1" })
    await chip.click()
    await chip.click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("別のチップを押すと絞り込みが切り替わる", async () => {
    const room = await openTaskListRoom("task-list-filtered-switched")
    await room.page.getByRole("button", { name: "未着手 1" }).click()
    await room.page.getByRole("button", { name: "完了 1" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("claim した todo は進行中のカードで先頭に出て、残りはファイルの順のまま並ぶ", async () => {
    const room = await openTaskListRoomWithRunningTask("task-list-running")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("一覧のIDを押すと実行の確認が開く", async () => {
    const room = await openTaskListRoom("task-list-run-confirm")
    await room.page.getByRole("button", { name: "T-001", exact: true }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("確認の「実行する」を押すと /next-task <ID> が送られて確認が閉じる（済んだタスクのIDも押せる）", async () => {
    const room = await openTaskListRoom("task-list-run-executed")
    await room.page.getByRole("button", { name: "T-002", exact: true }).click()
    await room.page.getByRole("button", { name: "実行する", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("確認の「キャンセル」を押すと何も送らず確認だけ閉じる", async () => {
    const room = await openTaskListRoom("task-list-run-cancel")
    await room.page.getByRole("button", { name: "T-001", exact: true }).click()
    await room.page.getByRole("button", { name: "キャンセル", exact: true }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("確認を Esc で閉じても何も送らない", async () => {
    const room = await openTaskListRoom("task-list-run-escape")
    await room.page.getByRole("button", { name: "T-001", exact: true }).click()
    await room.page.keyboard.press("Escape")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
