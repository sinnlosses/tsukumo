import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { FAKE_BEADS_ISSUES_PATH } from "../../src/server/repository/adapter/fake-beads.ts"
import type { DomRootName, ScenarioOptions, ScenarioRoom, ScenarioRun } from "./scenario-run.ts"

// タスクの一覧とタスクのモーダルの E2E の足場（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// この一覧だけは疑似セッションの場面ではなく、cwd の課題のファイルが元になる
// （疑似セッションの見張りは `bd` の代わりに `readFakeBeadsIssues` でこのファイルを読む）。
// 足場として、架空の課題を `bd list --json` の形で `FAKE_BEADS_ISSUES_PATH` に置く。
// プロジェクトの設定は置かない。
//
// 課題を置くのは、`open` が部屋を渡した（ブラウザが繋がった）あとにする。
// 起こす前や繋がる前に用意すると、tsukumo の最初の見回り（起こした時点で1回走る）が
// ブラウザの `hello` に畳まれてしまい、`tasks-changed` が `events` として届かず
// `waitForEvent` の的が無くなる。

/** 最初の課題を作った時刻と、閉じた時刻（走らせる日に依らない固定の値）。 */
const FIRST_CREATED_AT = Temporal.Instant.from("2026-01-14T00:00:00Z")
const CLOSED_AT = "2026-01-14T12:00:00Z"

/**
 * 課題1件。会話の内容ではない架空のタスク。`id` は Beads の ID の字のまま。
 * `status` の `doing` は着手中（`in_progress`）。
 */
type TaskFixture = {
  readonly id: string
  readonly summary: string
  readonly status: "todo" | "doing" | "done" | "hold"
  readonly dependencies: readonly string[]
  readonly description: string
  readonly acceptance: string
  readonly notes: string
}

/** 本文を指定しないタスクの本文（`## 目的・背景` の中身）。 */
const DEFAULT_DESCRIPTION = ["## 目的・背景", "", "架空の本文で、実物のタスクではない。"].join("\n")

/** 既定の本文の1件。 */
function task(
  id: string,
  summary: string,
  status: TaskFixture["status"],
  dependencies: readonly string[] = [],
): TaskFixture {
  return {
    id,
    summary,
    status,
    dependencies,
    description: DEFAULT_DESCRIPTION,
    acceptance: "",
    notes: "",
  }
}

/** {@link writeTaskFile} のあと、一覧が届くのを待つ。 */
async function placeTasks(room: ScenarioRoom, tasks: readonly TaskFixture[]): Promise<void> {
  writeTaskFile(room, tasks)
  await room.waitForTasksContaining(tasks.map((fixture) => fixture.id))
}

/**
 * `tasks` を課題のファイルに置く。見回りが書きかけを読まないよう、隣に書いてから名前を付け替える
 * （書きかけを読むと「不明」が届き、一覧の通知が1回増える）。
 */
function writeTaskFile(room: ScenarioRoom, tasks: readonly TaskFixture[]): void {
  const path = join(room.cwd, FAKE_BEADS_ISSUES_PATH)
  const writing = `${path}.writing`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    writing,
    JSON.stringify(tasks.map((fixture, index) => beadsIssueOf(fixture, index))),
  )
  renameSync(writing, path)
}

/** `bd list --json` の1件の形に写す。作った時刻は `index` 分ずつずらし、並びを `tasks` の順にする。 */
function beadsIssueOf(fixture: TaskFixture, index: number): Readonly<Record<string, unknown>> {
  return {
    id: fixture.id,
    title: fixture.summary,
    status: BEADS_STATUS[fixture.status],
    created_at: FIRST_CREATED_AT.add({ minutes: index }).toString(),
    ...(fixture.status === "done" ? { closed_at: CLOSED_AT } : {}),
    dependencies: fixture.dependencies.map((dependency) => ({
      issue_id: fixture.id,
      depends_on_id: dependency,
      type: "blocks",
    })),
    description: fixture.description,
    acceptance_criteria: fixture.acceptance,
    notes: fixture.notes,
  }
}

const BEADS_STATUS = {
  todo: "open",
  doing: "in_progress",
  done: "closed",
  hold: "deferred",
} as const satisfies Record<TaskFixture["status"], string>

export async function openTaskListRoom(
  run: ScenarioRun,
  scenario: string,
  domRoots: readonly DomRootName[],
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide", domRoots })
  await placeTasks(room, [
    task("t-001", "架空のタスク（未着手）", "todo"),
    task("t-002", "架空のタスク（完了）", "done"),
  ])
  return room
}

/** 上と同じ2件に、着手中の1件を加える。 */
export async function openTaskListRoomWithRunningTask(
  run: ScenarioRun,
  scenario: string,
  domRoots: readonly DomRootName[],
  viewport: ScenarioOptions["viewport"],
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport, domRoots })
  await placeTasks(room, [
    task("t-001", "架空のタスク（未着手）", "todo"),
    task("t-002", "架空のタスク（完了）", "done"),
    task("t-003", "架空のタスク（進行中）", "doing"),
  ])
  return room
}

/**
 * タスクの作業のレポート（`report` の `task` が一覧の2件目を指す場面）の足場。場面が終わってから、
 * その2件目と、一覧でその前に並ぶ1件を置く（レポートのタスクID は、一覧にあるタスクのときだけ押せる）。
 */
export async function openReportTaskRoom(
  run: ScenarioRun,
  scenario: string,
  scene: string,
  domRoots: readonly DomRootName[],
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene, viewport: "wide", domRoots })
  await room.waitForEvent("turn-finished")
  await placeTasks(room, [
    task("t-001", "架空のタスク（一覧の先頭）", "todo"),
    task("t-002", "架空のタスク（レポートが指すもの）", "todo"),
  ])
  return room
}

/**
 * タスクのモーダルの足場。状態の言い方が一通りそろう5件（着手できる・完了・進行中・待ち・保留）で、
 * 先頭の1件は本文に見出し・番号・チェック・表・フェンス・生の HTML・2種類のリンクを持つ。
 */
export async function openTaskBoardRoom(
  run: ScenarioRun,
  scenario: string,
  domRoots: readonly DomRootName[],
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide", domRoots })
  await placeTasks(room, [
    {
      ...task("t-001", "架空のタスク（`code` を含む要約）", "todo"),
      description: RICH_DESCRIPTION,
      acceptance: RICH_ACCEPTANCE,
      notes: RICH_NOTES,
    },
    task("t-002", "架空のタスク（完了）", "done"),
    task("t-003", "架空のタスク（進行中）", "doing"),
    task("t-004", "架空のタスク（待ち）", "todo", ["t-001"]),
    {
      ...task("t-005", "架空のタスク（保留）", "hold", ["t-001"]),
      description: ["## 目的・背景", "", "架空の保留の理由を本文にだけ書く。"].join("\n"),
    },
  ])
  await room.page.getByRole("button", { name: "一覧を見る" }).click()
  return room
}

/** 先頭のタスクの `description`。 */
const RICH_DESCRIPTION = [
  "## 目的・背景",
  "",
  "架空の本文で、実物のタスクではない。`inline code` と **強調** を含む。",
  "",
  "## 参考情報",
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
].join("\n")

/** 先頭のタスクの `acceptance_criteria`。 */
const RICH_ACCEPTANCE = ["- [ ] まだの条件", "- [x] 済んだ条件"].join("\n")

/** 先頭のタスクの `notes`。 */
const RICH_NOTES = ["1. 一つ目の手順", "2. 二つ目の手順", "", "### 段の見出し"].join("\n")

/** 迎える口の足場のタスクの ID。着手できるものと、前者に依存して止まるもの。 */
export const READY_TASK_ID = "t-001"
export const BLOCKED_TASK_ID = "t-002"

/** 依頼前の迎える口の足場。着手できるタスクと依存で止まるタスクを置いて、一覧が届くのを待つ。 */
export async function writeWelcomeTasks(room: ScenarioRoom): Promise<void> {
  await placeTasks(room, [
    task(READY_TASK_ID, "架空のタスク（着手できる）", "todo"),
    task(BLOCKED_TASK_ID, "架空のタスク（依存で止まる）", "todo", [READY_TASK_ID]),
  ])
}

/** プロジェクトの設定を画面から書く足場。未着手の1件を置き、設定は置かない。 */
export async function openProjectSettingsRoom(
  run: ScenarioRun,
  scenario: string,
  domRoots: readonly DomRootName[],
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide", domRoots })
  await placeTasks(room, [task("t-001", "架空のタスク（未着手）", "todo")])
  return room
}
