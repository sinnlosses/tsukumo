import type { Locator } from "playwright-core"

import { BEADS_TEST_ACTOR, placeBeadsWithIssues } from "../fixture/beads-repository.ts"
import { git, initGitRepository } from "../fixture/git-repository.ts"
import { writeProjectSettingsContent } from "../fixture/project-settings.ts"
import type { DomRootName, ScenarioOptions, ScenarioRoom, ScenarioRun } from "./scenario-run.ts"

// タスクの一覧とタスクのモーダルの E2E の足場（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// この一覧だけは疑似セッションの場面ではなく、cwd の Beads（`bd`）の課題が元になる
// （読み方は `watchTaskSummary` のコメント）。足場として、一時の cwd に `git init` して、
// 架空の課題を入れた `.beads` を置く（`placeBeadsWithIssues`）。プロジェクトの設定は置かない。
//
// 課題を置くのは、`open` が部屋を渡した（ブラウザが繋がった）あとにする。
// 起こす前や繋がる前に用意すると、tsukumo の最初の見回り（起こした時点で1回走る）が
// ブラウザの `hello` に畳まれてしまい、`tasks-changed` が `events` として届かず
// `waitForEvent` の的が無くなる。

/** 課題を作った時刻と閉じた時刻（走らせる日に依らない固定の値）。 */
const CREATED_AT = "2026-01-14T00:00:00Z"
const CLOSED_AT = "2026-01-14T12:00:00Z"

/** 課題1件。会話の内容ではない架空のタスク。`status` の `doing` は着手中（`in_progress` と持ち主）。 */
type TaskFixture = {
  readonly id: string
  readonly summary: string
  readonly status: "todo" | "doing" | "done" | "hold"
  readonly difficulty: string
  readonly loopable: string
  readonly dependencies: readonly string[]
  readonly description: string
  readonly acceptance: string
  readonly notes: string
}

/** 本文を指定しないタスクの本文（`## 目的・背景` の中身）。 */
const DEFAULT_DESCRIPTION = ["## 目的・背景", "", "架空の本文で、実物のタスクではない。"].join("\n")

/** 難易度 sonnet・ループ Y・既定の本文の1件。 */
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
    difficulty: "sonnet",
    loopable: "Y",
    dependencies,
    description: DEFAULT_DESCRIPTION,
    acceptance: "",
    notes: "",
  }
}

/** {@link placeBeadsTasks} のあと、一覧が届くのを待つ。 */
async function placeTasks(room: ScenarioRoom, tasks: readonly TaskFixture[]): Promise<void> {
  await placeBeadsTasks(room, tasks)
  await room.waitForTasksContaining(tasks.map((fixture) => fixture.id))
}

/** cwd を git リポジトリにし、`tasks` を入れた `.beads` を置く。 */
async function placeBeadsTasks(room: ScenarioRoom, tasks: readonly TaskFixture[]): Promise<void> {
  await initGitRepository(room.cwd)
  await git(room.cwd, "commit", "--quiet", "--allow-empty", "-m", "架空のリポジトリ")
  await placeBeadsWithIssues(room.cwd, tasks.map(beadsIssueOf))
}

/** `bd export` の1行の形に写す（ID は小文字にする）。 */
function beadsIssueOf(fixture: TaskFixture): Readonly<Record<string, unknown>> {
  const id = beadsIdOf(fixture.id)
  return {
    id,
    title: fixture.summary,
    status: BEADS_STATUS[fixture.status],
    created_at: CREATED_AT,
    ...(fixture.status === "done" ? { closed_at: CLOSED_AT } : {}),
    ...(fixture.status === "doing" ? { assignee: BEADS_TEST_ACTOR } : {}),
    labels: [`difficulty:${fixture.difficulty}`, `loopable:${fixture.loopable}`],
    dependencies: fixture.dependencies.map((dependency) => ({
      issue_id: id,
      depends_on_id: beadsIdOf(dependency),
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
  hold: "pending",
} as const satisfies Record<TaskFixture["status"], string>

function beadsIdOf(taskId: string): string {
  return taskId.toLowerCase()
}

export async function openTaskListRoom(
  run: ScenarioRun,
  scenario: string,
  domRoots: readonly DomRootName[],
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide", domRoots })
  await placeTasks(room, [
    task("T-001", "架空のタスク（未着手）", "todo"),
    task("T-002", "架空のタスク（完了）", "done"),
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
    task("T-001", "架空のタスク（未着手）", "todo"),
    task("T-002", "架空のタスク（完了）", "done"),
    task("T-003", "架空のタスク（進行中）", "doing"),
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
    task("T-001", "架空のタスク（一覧の先頭）", "todo"),
    task("T-002", "架空のタスク（レポートが指すもの）", "todo"),
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
  viewport: "wide" | "narrow" = "wide",
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport, domRoots })
  await placeTasks(room, [
    {
      ...task("T-001", "架空のタスク（`code` を含む要約）", "todo"),
      difficulty: "opus",
      description: RICH_DESCRIPTION,
      acceptance: RICH_ACCEPTANCE,
      notes: RICH_NOTES,
    },
    { ...task("T-002", "架空のタスク（完了）", "done"), difficulty: "haiku", loopable: "N" },
    task("T-003", "架空のタスク（進行中）", "doing"),
    task("T-004", "架空のタスク（待ち）", "todo", ["T-001"]),
    {
      ...task("T-005", "架空のタスク（保留）", "hold", ["T-001"]),
      loopable: "N",
      description: ["## 目的・背景", "", "架空の保留の理由を本文にだけ書く。"].join("\n"),
    },
  ])
  if (viewport === "narrow") {
    await room.page.getByRole("tab", { name: "サイドバー" }).click()
  }
  await room.page.getByRole("button", { name: "一覧を見る" }).click()
  return room
}

/** 開いているタスクのモーダル（サイドバーのチップと同じ名前の札があるので、操作はこの中に絞る）。 */
export function boardDialog(room: ScenarioRoom): Locator {
  return room.page.getByRole("dialog", { name: "タスク" })
}

/**
 * 一覧の1行（`id` の完全一致）。依存の状態の字（「待ち」に続く ID）が別の行の要約に
 * 混じるので、`getByRole("option")` の `hasText` では絞り切れない。
 */
export function boardOption(room: ScenarioRoom, id: string): Locator {
  return boardDialog(room).locator(`#task-board-option-${id}`)
}

/**
 * 「つながりをたどる」の足場。起点のタスクを2件目が依存に持ち、2件目を3件目が依存に持つ
 * （起点を選ぶと依存元の1件が、2件目を選ぶと依存の起点と依存元の3件目が並ぶ）。
 * 4件目は保留で起点へ本文から言及するだけの、絞り込みの外への飛び先。
 */
export async function openTaskBoardJumpRoom(
  run: ScenarioRun,
  scenario: string,
  viewport: "wide" | "narrow" = "wide",
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport, domRoots: ["task-board"] })
  await placeTasks(room, [
    {
      ...task("T-001", "架空のタスク（つながりの起点）", "todo"),
      description: JUMP_DESCRIPTION_T001,
    },
    task("T-002", "架空のタスク（T-001 に依存）", "todo", ["T-001"]),
    task("T-003", "架空のタスク（T-002 に依存）", "todo", ["T-002"]),
    {
      ...task("T-004", "架空のタスク（保留・本文で T-001 へ言及）", "hold"),
      description: JUMP_DESCRIPTION_T004,
    },
  ])
  if (viewport === "narrow") {
    await room.page.getByRole("tab", { name: "サイドバー" }).click()
  }
  await room.page.getByRole("button", { name: "一覧を見る" }).click()
  return room
}

/** 先頭のタスクの本文のうち、`## やること` と `## 完了条件` 以外の節。 */
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

/** 先頭のタスクの `## 完了条件`。 */
const RICH_ACCEPTANCE = ["- [ ] まだの条件", "- [x] 済んだ条件"].join("\n")

/** 先頭のタスクの `## やること`。 */
const RICH_NOTES = ["1. 一つ目の手順", "2. 二つ目の手順", "", "### 段の見出し"].join("\n")

/**
 * 起点のタスクの本文。地の文の ID・中身がまるごと同じ ID の inline code は一覧に載っている
 * ので押せる。語の途中・まるごとでない inline code・フェンスの中・一覧に無い ID はどれも
 * 押せない字のまま出る。
 */
const JUMP_DESCRIPTION_T001 = [
  "## 参照",
  "",
  "地の文の T-002 は押せる。T-0021 は語の途中なので押せない。T-999 は一覧に無いので押せない。",
  "",
  "中身がまるごと `T-002` の inline code は押せる。`T-0025` はまるごとでないので押せない。",
  "",
  "```",
  "T-002",
  "```",
].join("\n")

/** 保留のタスクの本文。地の文で起点のタスクへ言及するだけ。 */
const JUMP_DESCRIPTION_T004 = ["## 参照", "", "先に T-001 を見る。"].join("\n")

/** 迎える口の足場のタスクの ID。着手できるものと、前者に依存して止まるもの。 */
export const READY_TASK_ID = "T-001"
export const BLOCKED_TASK_ID = "T-002"

/** 依頼前の迎える口の足場。着手できるタスクと依存で止まるタスクを置いて、一覧が届くのを待つ。 */
export async function writeWelcomeTasks(room: ScenarioRoom): Promise<void> {
  await placeTasks(room, [
    task(READY_TASK_ID, "架空のタスク（着手できる）", "todo"),
    task(BLOCKED_TASK_ID, "架空のタスク（依存で止まる）", "todo", [READY_TASK_ID]),
  ])
}

/**
 * プロジェクトの設定を画面から書く足場。未着手の1件を置き、設定は置かない（`missing`）か、
 * 壊れた中身で置く（`invalid`。課題より先に置き、一覧が一度も届かないようにする）か、
 * 「使わない」を置く（`off`。課題は置かない）。
 */
export async function openProjectSettingsRoom(
  run: ScenarioRun,
  scenario: string,
  domRoots: readonly DomRootName[],
  settings: "missing" | "invalid" | "off",
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide", domRoots })
  if (settings === "off") {
    writeProjectSettingsContent(room.cwd, '{ "tasks": "off" }')
    await room.waitForEvent("tasks-changed")
    return room
  }
  const tasks = [task("T-001", "架空のタスク（未着手）", "todo")]
  if (settings === "missing") {
    await placeTasks(room, tasks)
    return room
  }
  writeProjectSettingsContent(room.cwd, "{")
  await placeBeadsTasks(room, tasks)
  return room
}
