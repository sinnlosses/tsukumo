// タスクファイルの出入り（登録日・消えたファイル）と、そこから決まる卒業を数える判断だけを持つ。
// ファイル I/O も `git` も触らない純関数で、履歴を読むのは呼び出し側。
// 数え方の規則の正典は `docs/requirements.md`「成果の振り返り」。
//
// 会話の文面は扱わない。運ぶのはタスクの ID・summary・日付だけ。

import { prop, sortBy } from "remeda"

import type { AchievementGraduation } from "../../../shared/achievement/achievement.ts"
import { parseNewTaskFile } from "../../../shared/repository/task-summary.ts"
import type { TaskSummaryDiffItem } from "./done-task-source.ts"

/** `develop/task/T-xxx.md` のパスから ID を取る。当てはまらなければ `undefined`。 */
const TASK_FILE_PATH_PATTERN = /^develop\/task\/(T-\d{3,})\.md$/

/** `develop/task/T-xxx.md` のパスから ID を取る（{@link TASK_FILE_PATH_PATTERN}）。 */
export function taskFileIdOfPath(path: string): string | undefined {
  return TASK_FILE_PATH_PATTERN.exec(path)?.[1]
}

/**
 * `git log --name-status` の1行（`A\tdevelop/task/T-xxx.md` の形）。
 * R（リネーム）は扱わない（タスクファイルはリネームしない運用のため）。
 */
export type TaskFileChange = { readonly status: string; readonly path: string }

/**
 * `git log H --first-parent --name-status -- develop/task/ develop/tasks.json` の1コミット分。
 * `localDateKey` は committer date をローカルの日付に直したもの。
 */
export type TaskFileHistoryCommit = {
  readonly committedAtEpochSeconds: number
  readonly localDateKey: string
  readonly changes: readonly TaskFileChange[]
}

/**
 * タスクごとの登録日の表。git のタスクファイルは最古の `A` のコミットの日付。
 * `develop/tasks.json` の `D` を含むコミット（形式の切り替え）で入ったファイルは表に入れない（旧形式で登録したタスクとみなす）。
 *
 * `beadsCreatedOn`（Beads の課題の作った日。ファイル方式なら空）は、git のタスクファイルとして一度も現れなかった ID にだけ使う。
 * Beads へ移した課題の作った日は移した日で、登録日ではないため。
 */
export function taskRegistrationDates(
  commits: readonly TaskFileHistoryCommit[],
  beadsCreatedOn: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const registeredOn = new Map<string, string>()
  const seenInGit = new Set(
    commits.flatMap((commit) =>
      commit.changes.flatMap((change) => {
        const id = taskFileIdOfPath(change.path)
        return id === undefined ? [] : [id]
      }),
    ),
  )
  for (const [id, createdOn] of beadsCreatedOn) {
    if (!seenInGit.has(id)) {
      registeredOn.set(id, createdOn)
    }
  }

  for (const commit of commits) {
    const isFormatSwitch = commit.changes.some(
      (change) => change.status === "D" && change.path === "develop/tasks.json",
    )
    if (isFormatSwitch) {
      continue
    }
    for (const change of commit.changes) {
      if (change.status !== "A") {
        continue
      }
      const id = taskFileIdOfPath(change.path)
      if (id === undefined) {
        continue
      }
      const existing = registeredOn.get(id)
      if (existing === undefined || commit.localDateKey < existing) {
        registeredOn.set(id, commit.localDateKey)
      }
    }
  }

  return registeredOn
}

/**
 * `develop/task/` から消えた（剪定された）ファイル1件。
 * `content` は消したコミットの親の版（`<コミット>^:<パス>`）で、読めなかったときは `undefined`。
 */
export type DeletedTaskFile = {
  readonly id: string
  readonly committedAtEpochSeconds: number
  readonly content: string | undefined
}

/**
 * 消えたファイルのうち、`beforeEpochSeconds` より前に消え、消える直前の版が `status: done` のものを id → summary で返す。
 * 切り口（{@link doneTaskSummaries}）の結果と足し合わせて使わないと、その日のうちに消されたタスクが終えたタスクからも通算の数からも漏れる。
 */
export function deletedDoneTaskSummariesBefore(
  deletedFiles: readonly DeletedTaskFile[],
  beforeEpochSeconds: number,
): ReadonlyMap<string, string> {
  const summaries = new Map<string, string>()
  for (const file of deletedFiles) {
    if (file.committedAtEpochSeconds >= beforeEpochSeconds || file.content === undefined) {
      continue
    }
    const task = parseNewTaskFile(`${file.id}.md`, file.content)
    if (task !== undefined && task.status === "done") {
      summaries.set(file.id, task.summary)
    }
  }
  return summaries
}

/** 卒業とみなす、登録からの日数の下限（仮）。 */
export const GRADUATION_MIN_DAYS = 7

/**
 * その日に終えたタスクのうち、登録から {@link GRADUATION_MIN_DAYS} 日以上経っていたものを、登録の古い順で返す。
 * 登録日が無い（旧形式や形式切り替えで登録した）タスクは対象にしない。
 * `endedOn` はその日の日付キー（終えた日）。
 */
export function graduationsOf(
  items: readonly TaskSummaryDiffItem[],
  registeredOnById: ReadonlyMap<string, string>,
  endedOn: string,
): readonly AchievementGraduation[] {
  const endedOnDate = Temporal.PlainDate.from(endedOn)
  const graduations = items.flatMap((item) => {
    const registeredOn = registeredOnById.get(item.id)
    if (registeredOn === undefined) {
      return []
    }
    const days = endedOnDate.since(Temporal.PlainDate.from(registeredOn), {
      largestUnit: "day",
    }).days
    return days >= GRADUATION_MIN_DAYS
      ? [{ id: item.id, summary: item.summary, registeredOn, days }]
      : []
  })
  return sortBy(graduations, prop("registeredOn"))
}
