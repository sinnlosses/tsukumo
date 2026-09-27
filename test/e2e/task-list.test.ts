import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, it } from "vitest"

import { runSubprocessOrThrow } from "../fixture/subprocess.ts"
import { type ScenarioRoom, useScenarioRun } from "./scenario-run.ts"

// タスクの一覧（docs/design.md 10章「E2E のシナリオの一覧」）。この一覧だけは疑似セッションの
// 場面ではなく、cwd の `main` にある `develop/task/*.md` が元になる
// （読み方は `src/server/repository/adapter/task-summary.ts` の冒頭）。足場として、一時の cwd に `git init` して `develop/task/` を
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

async function git(cwd: string, ...args: readonly string[]): Promise<void> {
  await runSubprocessOrThrow("git", args, { cwd })
}

/** `develop/task/T-xxx.md` を1件、新形式の front matter で書く（claude-skills の
 * `docs/task-workflow-redesign.md` 3.2）。会話の内容ではない架空のタスク。 */
function writeTask(cwd: string, id: string, summary: string, status: string): void {
  mkdirSync(join(cwd, "develop", "task"), { recursive: true })
  const content = [
    "---",
    `id: ${id}`,
    `summary: ${summary}`,
    `status: ${status}`,
    "difficulty: sonnet",
    "loopable: Y",
    "dependencies: []",
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

  await git(room.cwd, "init", "--quiet", "-b", "main")
  await git(room.cwd, "config", "user.name", "tsukumo-e2e")
  await git(room.cwd, "config", "user.email", "tsukumo-e2e@example.invalid")
  await git(room.cwd, "config", "commit.gpgsign", "false")
  await git(room.cwd, "config", "core.hooksPath", "/dev/null")
  writeTask(room.cwd, "T-001", "架空のタスク（未着手）", "todo")
  writeTask(room.cwd, "T-002", "架空のタスク（完了）", "done")
  await git(room.cwd, "add", "develop/task")
  await git(room.cwd, "commit", "--quiet", "-m", "架空のタスク一覧")

  await room.waitForEvent("tasks-changed")
  return room
}

describe("タスクの一覧", () => {
  it("main の develop/task/ を読み、サイドバーのタスク一覧に並ぶ", async () => {
    const room = await openTaskListRoom("task-list")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("見出しの「一覧を見る」で表が開く", async () => {
    const room = await openTaskListRoom("task-list-board-open")
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
})
