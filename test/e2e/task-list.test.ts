import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { Locator } from "playwright-core"
import { describe, it } from "vitest"

import { claimTask, git, initGitRepository } from "../fixture/git-repository.ts"
import { type ScenarioRoom, useScenarioRun } from "./scenario-run.ts"

// タスクの一覧（docs/architecture/testing.md「E2E のシナリオの一覧」）。この一覧だけは疑似セッションの
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

/** タスクファイル1件の中身。会話の内容ではない架空のタスク。 */
type TaskFixture = {
  readonly id: string
  readonly summary: string
  readonly status: string
  readonly difficulty: string
  readonly loopable: string
  readonly dependencies: readonly string[]
  readonly body: string
}

/** 本文を指定しないタスクの本文。 */
const DEFAULT_BODY = ["## 目的", "", "架空の本文で、実物のタスクではない。", ""].join("\n")

/** `develop/task/<ID>.md` を1件、新形式の front matter で書く（claude-skills の
 * `docs/task-workflow-redesign.md` が正典）。 */
function writeTaskFile(cwd: string, task: TaskFixture): void {
  mkdirSync(join(cwd, "develop", "task"), { recursive: true })
  const content = [
    "---",
    `id: ${task.id}`,
    `summary: ${task.summary}`,
    `status: ${task.status}`,
    `difficulty: ${task.difficulty}`,
    `loopable: ${task.loopable}`,
    `dependencies: [${task.dependencies.join(", ")}]`,
    "---",
    "",
    task.body,
  ].join("\n")
  writeFileSync(join(cwd, "develop", "task", `${task.id}.md`), content)
}

/** 難易度 sonnet・ループ Y・既定の本文の1件を書く。 */
function writeTask(
  cwd: string,
  id: string,
  summary: string,
  status: string,
  dependencies: readonly string[] = [],
): void {
  writeTaskFile(cwd, {
    id,
    summary,
    status,
    difficulty: "sonnet",
    loopable: "Y",
    dependencies,
    body: DEFAULT_BODY,
  })
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

/**
 * タスクのモーダルの足場。状態の言い方が一通りそろう5件（着手できる・完了・進行中・待ち・保留）で、
 * 先頭の1件は本文に見出し・番号・チェック・表・フェンス・生の HTML・2種類のリンクを持つ。
 */
async function openTaskBoardRoom(
  scenario: string,
  viewport: "wide" | "narrow" = "wide",
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport })

  await initGitRepository(room.cwd)
  writeTaskFile(room.cwd, {
    id: "T-001",
    summary: "架空のタスク（`code` を含む要約）",
    status: "todo",
    difficulty: "opus",
    loopable: "Y",
    dependencies: [],
    body: RICH_BODY,
  })
  writeTaskFile(room.cwd, {
    id: "T-002",
    summary: "架空のタスク（完了）",
    status: "done",
    difficulty: "haiku",
    loopable: "N",
    dependencies: [],
    body: DEFAULT_BODY,
  })
  writeTask(room.cwd, "T-003", "架空のタスク（進行中）", "todo")
  writeTask(room.cwd, "T-004", "架空のタスク（待ち）", "todo", ["T-001", "T-009"])
  writeTaskFile(room.cwd, {
    id: "T-005",
    summary: "架空のタスク（保留）",
    status: "hold",
    difficulty: "sonnet",
    loopable: "N",
    dependencies: ["T-001"],
    body: ["## 目的", "", "架空の保留の理由を本文にだけ書く。", ""].join("\n"),
  })
  await git(room.cwd, "add", "develop/task")
  await git(room.cwd, "commit", "--quiet", "-m", "架空のタスク一覧")
  await claimTask(room.cwd, "T-003")

  await room.waitForEvent("tasks-changed")
  if (viewport === "narrow") {
    await room.page.getByRole("tab", { name: "サイドバー" }).click()
  }
  await room.page.getByRole("button", { name: "一覧を見る" }).click()
  return room
}

/** 開いているタスクのモーダル（サイドバーのチップと同じ名前の札があるので、操作はこの中に絞る）。 */
function boardDialog(room: ScenarioRoom): Locator {
  return room.page.getByRole("dialog", { name: "タスク" })
}

/** 先頭のタスクの本文。モーダルが描く Markdown の要素を一通り持つ。 */
const RICH_BODY = [
  "## 目的・背景",
  "",
  "架空の本文で、実物のタスクではない。`inline code` と **強調** を含む。",
  "",
  "## やること",
  "",
  "1. 一つ目の手順",
  "2. 二つ目の手順",
  "",
  "## 完了条件",
  "",
  "- [ ] まだの条件",
  "- [x] 済んだ条件",
  "",
  "### 参考",
  "",
  "| 項目 | 値 |",
  "| --- | --- |",
  "| 甲 | 1 |",
  "",
  "```sh",
  "echo 架空",
  "```",
  "",
  "<b>生の HTML は字のまま出る</b>",
  "",
  "[外のリンク](https://example.invalid/foo) と [相対のリンク](foo/bar.md)",
  "",
].join("\n")

describe("タスクの一覧", () => {
  it("main の develop/task/ を読み、サイドバーのタスク一覧に並ぶ", async () => {
    const room = await openTaskListRoom("task-list")
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

describe("タスクのモーダル", () => {
  it("「一覧を見る」で開き、左の一覧の先頭を選んで右に本文を Markdown で描く", async () => {
    const room = await openTaskBoardRoom("task-board-open")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("↓ で行を移ると詳細が切り替わる（待ちのタスクは依存の札を並べ、頼めない理由を添える）", async () => {
    const room = await openTaskBoardRoom("task-board-arrow")
    await room.page.keyboard.press("ArrowDown")
    await room.page.keyboard.press("ArrowDown")
    await room.page.keyboard.press("ArrowDown")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("検索は本文も引き、当たった行を選ぶ", async () => {
    const room = await openTaskBoardRoom("task-board-search")
    await boardDialog(room).getByRole("combobox", { name: "タスクを探す" }).fill("保留の理由")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("絞り込みの札を押すとその状態だけに絞る", async () => {
    const room = await openTaskBoardRoom("task-board-filter")
    await boardDialog(room).getByRole("button", { name: "進行中 1" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("検索と絞り込みは組み合わさり、当たらなければその旨を出して詳細を空にする", async () => {
    const room = await openTaskBoardRoom("task-board-filter-search-empty")
    await boardDialog(room).getByRole("button", { name: "待ち 1" }).click()
    await boardDialog(room).getByRole("combobox", { name: "タスクを探す" }).fill("完了")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("「tsukumo に頼む」から確認を通すと /next-task <ID> が送られ、モーダルも閉じる", async () => {
    const room = await openTaskBoardRoom("task-board-run")
    await boardDialog(room).getByRole("button", { name: "tsukumo に頼む" }).click()
    await room.page.getByRole("button", { name: "実行する", exact: true }).click()
    await room.waitForEvent("request")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("狭い画面でも同じ中身を2列を縦に積んで出す", async () => {
    const room = await openTaskBoardRoom("task-board-narrow", "narrow")
    await room.settleAndMatch(ELAPSED_MS)
  })
})
