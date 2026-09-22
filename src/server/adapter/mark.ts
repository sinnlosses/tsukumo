// `.git` の共有の場所に置く印（`docs/architecture.md`「worktree でセッションを分ける」の決定4）。
// **worktree の「使用中」の印**と**タスクの「着手」の印**の2つがあり、
// **置き場・pid の生死・落ちたセッションの掃除は同じ**なのでここ1つにまとめてある。
// 印に書く中身だけは揃えない——worktree の印は名前そのものが場所と時刻を持つので pid だけで足り、
// タスクの印はタスクidから場所が分からないので pid・時刻・作業先を書く。
//
// `git rev-parse --path-format=absolute --git-common-dir` が**全 worktree から同じ絶対パス**を
// 返すので、ここがバージョン管理の外で唯一 worktree をまたいで共有される場所になる。
// **git を起こすのはここではない**（`.git` の絶対パスは `worktree.ts` が引いて渡す。
// `node:child_process` を持つファイルを増やさない。`test/architecture.test.ts`）。
//
// **pid の使い回しは見分けない**（起動時刻と併せない）。他のプロセスの起動時刻を読むには `ps` の
// ような外部コマンドが要り、依存を増やすには承認が必要（`CLAUDE.md`）。取り違えたときは
// 「生きている扱い＝取れない」へ倒れるので、二重着手にはならない（取り残しは人が印を消せる）。
//
// 印に会話の内容を書かない（`docs/coding-standards.md`「会話内容の扱い」）。

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"

import { isPlainObject } from "remeda"

import { type Workdir } from "../../shared/workspace.ts"
import {
  decideTaskMark,
  readTaskMark,
  type TaskClaim,
  type TaskMark,
  type TaskMarkState,
  writeTaskMark,
} from "../core/task-claim.ts"
import { isoWithOffset } from "./local-time.ts"

/** `.git` の下に作る、tsukumo の持ち物の親。**worktree の実体も印もこの下に並ぶ。** */
const TSUKUMO_DIR_NAME = "tsukumo"

/** worktree を使っているセッションの印（名前は worktree の名前）。 */
const WORKTREE_MARK_DIR_NAME = "mark"

/** タスクを取ったセッションの印（名前はタスクid）。 */
const TASK_MARK_DIR_NAME = "claim"

/**
 * `.git` の下の、tsukumo の持ち物の親。**worktree の置き場（`worktree/<名前>`）もここから組む**
 * ので、「同じ親を共有する」という決定がこの1行に収まる。
 */
export function tsukumoGitDir(gitDir: string): string {
  return join(gitDir, TSUKUMO_DIR_NAME)
}

/** 使用中の印を置く（**切ったディレクトリを取った直後**に呼ぶ）。 */
export async function writeWorktreeMark(gitDir: string, name: string): Promise<void> {
  const path = worktreeMarkPath(gitDir, name)
  await mkdir(worktreeMarkDir(gitDir), { recursive: true })
  await writeFile(path, `${String(process.pid)}\n`, "utf8")
}

/** 使用中の印のある worktree の名前（**起動時の掃除はここから始まる**）。 */
export async function listWorktreeMarkNames(gitDir: string): Promise<readonly string[]> {
  return readdir(worktreeMarkDir(gitDir)).catch(() => [])
}

/** その worktree を使っているセッションが生きているか。**読めない印は生きていない扱い。** */
export async function isWorktreeInUse(gitDir: string, name: string): Promise<boolean> {
  const written = await readMarkFile(worktreeMarkPath(gitDir, name))
  const pid = Number(written?.trim())
  return Number.isInteger(pid) && pid > 0 && isProcessRunning(pid)
}

/** 使用中の印を消す（**畳んだあと**と、切りそこねて名前を返すとき）。 */
export async function removeWorktreeMark(gitDir: string, name: string): Promise<void> {
  await rm(worktreeMarkPath(gitDir, name), { force: true })
}

/**
 * タスクを1つ取りに行く。**先に落ちたセッションの印を掃除し**、そのうえで
 * **ファイルを作れたセッションだけが勝つ**（`wx` の排他。同時に取りに来ても一方しか作れない）。
 *
 * 取れなかったときに返すのは**先に取っているセッションの印**で、呼び出し側はそれをそのまま
 * 人に見せられる（どの pid が、いつから、どこで取っているか）。
 */
export async function claimTask(options: {
  readonly gitDir: string
  readonly taskId: string
  readonly workdir: Workdir
}): Promise<TaskClaim> {
  const { gitDir, taskId } = options
  await sweepTaskMarks(gitDir)

  const mark: TaskMark = {
    taskId,
    pid: process.pid,
    // 時計を読むのはここ（`core` は「いま何時か」を知らない）。
    claimedAt: isoWithOffset(Temporal.Now.instant().epochMilliseconds),
    workdir: options.workdir,
  }
  const created = await mkdir(taskMarkDir(gitDir), { recursive: true })
    .then(() => writeFile(taskMarkPath(gitDir, taskId), writeTaskMark(mark), { flag: "wx" }))
    .then(
      () => true,
      () => false,
    )
  if (created) {
    return { kind: "claimed", mark }
  }

  // 作れなかった。**掃除を済ませたあとなので、置かれているのは生きているセッションの印**
  // （取りに来た側と同時に書かれたものを含む）。読めないときだけ、取れない理由が分からない。
  const state = await readTaskMarkState(gitDir, taskId)
  return state.kind === "found"
    ? { kind: "held", by: state.mark }
    : { kind: "failed", reason: `着手の印を置けなかった: ${taskMarkPath(gitDir, taskId)}` }
}

/**
 * 取ったタスクの印を返す（終えたとき・諦めたとき）。**自分が取った印でなければ触らない**
 * （pid で見分ける。他のセッションの印を消すと二重着手が起きる）。
 */
export async function releaseTask(options: {
  readonly gitDir: string
  readonly taskId: string
}): Promise<void> {
  const state = await readTaskMarkState(options.gitDir, options.taskId)
  if (state.kind === "found" && state.mark.pid !== process.pid) {
    return
  }
  await rm(taskMarkPath(options.gitDir, options.taskId), { force: true })
}

/**
 * 落ちたセッションの印を消す。**取りに来たセッションが、取る前に置き場全体を見る**
 * （`docs/architecture.md`「worktree でセッションを分ける」の決定3）。掃除に失敗しても
 * 取りに行くのは続ける（次に取りに来たセッションがもう一度見る）。
 */
async function sweepTaskMarks(gitDir: string): Promise<void> {
  const taskIds = await readdir(taskMarkDir(gitDir)).catch(() => [])
  for (const taskId of taskIds) {
    const fate = decideTaskMark(await readTaskMarkState(gitDir, taskId))
    if (fate.kind === "stale") {
      await rm(taskMarkPath(gitDir, taskId), { force: true }).catch(() => undefined)
    }
  }
}

/** 置かれている印1つの、いま分かっていること（読めなければ `unreadable`）。 */
async function readTaskMarkState(gitDir: string, taskId: string): Promise<TaskMarkState> {
  const written = await readMarkFile(taskMarkPath(gitDir, taskId))
  const mark = written === undefined ? undefined : readTaskMark(written)
  return mark === undefined
    ? { kind: "unreadable" }
    : { kind: "found", mark, running: isProcessRunning(mark.pid) }
}

/** pid のプロセスが生きているか。 */
function isProcessRunning(pid: number): boolean {
  try {
    // シグナル 0 は届けずに存在だけを見る。**別の利用者のプロセスなら EPERM** で、
    // これも「生きている」。
    process.kill(pid, 0)
    return true
  } catch (error) {
    return isPlainObject(error) && error["code"] === "EPERM"
  }
}

/** 印1つの中身（**無い・読めないときは undefined**。印が無いのは普通のこと）。 */
async function readMarkFile(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined)
}

function worktreeMarkDir(gitDir: string): string {
  return join(tsukumoGitDir(gitDir), WORKTREE_MARK_DIR_NAME)
}

function worktreeMarkPath(gitDir: string, name: string): string {
  return join(worktreeMarkDir(gitDir), name)
}

function taskMarkDir(gitDir: string): string {
  return join(tsukumoGitDir(gitDir), TASK_MARK_DIR_NAME)
}

function taskMarkPath(gitDir: string, taskId: string): string {
  return join(taskMarkDir(gitDir), taskId)
}
