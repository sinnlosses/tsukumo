import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { Locator } from "playwright-core"

import { claimTask, git, initGitRepository } from "../fixture/git-repository.ts"
import type { DomRootName, ScenarioRoom, ScenarioRun } from "./scenario-run.ts"

// タスクの一覧とタスクのモーダルの E2E の足場（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// この一覧だけは疑似セッションの
// 場面ではなく、cwd の `main` にある `develop/task/*.md` が元になる
// （読み方は `watchTaskSummary` のコメント）。足場として、一時の cwd に `git init` して `develop/task/` を
// 手書きし、`main` へコミットする。
//
// リポジトリを作るのは、`open` が部屋を渡した（ブラウザが繋がった）あとにする。
// 起こす前や繋がる前に用意すると、tsukumo の最初の見回り（起こした時点で1回走る）が
// ブラウザの `hello` に畳まれてしまい、`tasks-changed` が `events` として届かず
// `waitForEvent` の的が無くなる。

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

export async function openTaskListRoom(
  run: ScenarioRun,
  scenario: string,
  domRoots: readonly DomRootName[],
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide", domRoots })

  await initGitRepository(room.cwd)
  writeTask(room.cwd, "T-001", "架空のタスク（未着手）", "todo")
  writeTask(room.cwd, "T-002", "架空のタスク（完了）", "done")
  await git(room.cwd, "add", "develop/task")
  await git(room.cwd, "commit", "--quiet", "-m", "架空のタスク一覧")

  await room.waitForEvent("tasks-changed")
  return room
}

/**
 * 上と同じ2件に、着手の印（`task claim` 相当）を立てた `todo` を1件加える。印はコミットの前に立てる
 * （あとに立てると、間に入った見回りの1回目の `tasks-changed` に印が乗らない）。
 */
export async function openTaskListRoomWithRunningTask(
  run: ScenarioRun,
  scenario: string,
  domRoots: readonly DomRootName[],
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene: "none", viewport: "wide", domRoots })

  await initGitRepository(room.cwd)
  writeTask(room.cwd, "T-001", "架空のタスク（未着手）", "todo")
  writeTask(room.cwd, "T-002", "架空のタスク（完了）", "done")
  writeTask(room.cwd, "T-003", "架空のタスク（進行中）", "todo")
  await claimTask(room.cwd, "T-003")
  await git(room.cwd, "add", "develop/task")
  await git(room.cwd, "commit", "--quiet", "-m", "架空のタスク一覧")

  await room.waitForEvent("tasks-changed")
  return room
}

/**
 * タスクの作業のレポート（`report` の `task` が一覧の2件目を指す場面）の足場。場面が終わってから、
 * その2件目と、一覧でその前に並ぶ1件を書く（レポートのタスクID は、一覧にあるタスクのときだけ押せる）。
 */
export async function openReportTaskRoom(
  run: ScenarioRun,
  scenario: string,
  scene: string,
  domRoots: readonly DomRootName[],
): Promise<ScenarioRoom> {
  const room = await run.open({ scenario, scene, viewport: "wide", domRoots })
  await room.waitForEvent("turn-finished")

  await initGitRepository(room.cwd)
  writeTask(room.cwd, "T-001", "架空のタスク（一覧の先頭）", "todo")
  writeTask(room.cwd, "T-002", "架空のタスク（レポートが指すもの）", "todo")
  await git(room.cwd, "add", "develop/task")
  await git(room.cwd, "commit", "--quiet", "-m", "架空のタスク一覧")

  await room.waitForEvent("tasks-changed")
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
  await claimTask(room.cwd, "T-003")
  await git(room.cwd, "add", "develop/task")
  await git(room.cwd, "commit", "--quiet", "-m", "架空のタスク一覧")

  await room.waitForEvent("tasks-changed")
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

  await initGitRepository(room.cwd)
  writeTaskFile(room.cwd, {
    id: "T-001",
    summary: "架空のタスク（つながりの起点）",
    status: "todo",
    difficulty: "sonnet",
    loopable: "Y",
    dependencies: [],
    body: JUMP_BODY_T001,
  })
  writeTask(room.cwd, "T-002", "架空のタスク（T-001 に依存）", "todo", ["T-001"])
  writeTask(room.cwd, "T-003", "架空のタスク（T-002 に依存）", "todo", ["T-002"])
  writeTaskFile(room.cwd, {
    id: "T-004",
    summary: "架空のタスク（保留・本文で T-001 へ言及）",
    status: "hold",
    difficulty: "sonnet",
    loopable: "Y",
    dependencies: [],
    body: JUMP_BODY_T004,
  })
  await git(room.cwd, "add", "develop/task")
  await git(room.cwd, "commit", "--quiet", "-m", "架空のタスク一覧（つながり）")

  await room.waitForEvent("tasks-changed")
  if (viewport === "narrow") {
    await room.page.getByRole("tab", { name: "サイドバー" }).click()
  }
  await room.page.getByRole("button", { name: "一覧を見る" }).click()
  return room
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

/**
 * 起点のタスクの本文。地の文の ID・中身がまるごと同じ ID の inline code は一覧に載っている
 * ので押せる。語の途中・まるごとでない inline code・フェンスの中・一覧に無い ID はどれも
 * 押せない字のまま出る。
 */
const JUMP_BODY_T001 = [
  "## 参照",
  "",
  "地の文の T-002 は押せる。T-0021 は語の途中なので押せない。T-999 は一覧に無いので押せない。",
  "",
  "中身がまるごと `T-002` の inline code は押せる。`T-0025` はまるごとでないので押せない。",
  "",
  "```",
  "T-002",
  "```",
  "",
].join("\n")

/** 保留のタスクの本文。地の文で起点のタスクへ言及するだけ。 */
const JUMP_BODY_T004 = ["## 参照", "", "先に T-001 を見る。", ""].join("\n")
