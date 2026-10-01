// `main` のタスク一覧を見張る。
// `main` の先端のコミットが変わったとき、台帳の着手の印が変わったとき、または Beads の課題が変わったときに読み直し、`onChange` を呼ぶ。
//
// どこから読むかは `main` の先端の設定ファイル（AGENTS.md → CLAUDE.md）の `- タスクの置き場:` 行で決める。
// 作業ツリーの設定ファイルは見ない（`main` へ送るまで方式が変わらない）。
//
// ファイル方式: 読むのは作業ツリーのファイルではなく `main` の上の `develop/task/*.md` の front matter。
// 作業ツリーのものは `git merge main` するまで別の作業ツリーで足したタスクを知らない。
// `git ls-tree` で列挙し、`git cat-file --batch` で1回の子プロセスでまとめて読む。
// 着手中はファイルに書かれない。台帳の着手の印（`task claim` / `task release`）は共有の `.git` の下だけで完結し、`main` を動かさない。
// そのため `main` の先端が同じ見回りでも `task-workflow/claim/` の一覧だけは毎回読み直し、前回と変わっていれば `onChange` する。
// このときファイルは読み直さず、前回読んだ front matter に新しい印の集合を当て直すだけにする。
//
// Beads 方式: 要約が前回と変わっていれば `onChange` する。
// 着手・完了は `main` を動かさないので、先端が同じでも読み直す。
// `bd list` は1回が `git rev-parse` より2桁重いので、見回りの間隔を長くし（`TASK_SUMMARY_POLL_INTERVALS`）、
// 課題の変化の印（`createBeadsStampReader`）が前回と同じなら `bd list` を打たない。印が取れないときは毎回打つ。
//
// 見回りは `setWatching(true)` のあいだだけ回る。起こした時点の1回は、画面が無くても読む。
// 止めているあいだも覚えた状態は残し、再開の1回で変わっていれば `onChange` する。
//
// `main` が読めないとき（git リポジトリでない・`main` ブランチが無い・`git` が無い）、ファイル方式で `develop/task/` が無いとき、Beads 方式で `bd` が読めないとき、方式の行が読めないときは「不明」にする。
// 作業ツリーのファイルへは落とさない。落とすと読み元が2つになり、`main` の名前が違うリポジトリで一覧が黙って古いほうへ戻る（「不明」なら画面で気付ける）。
// `git`・`bd` がタイムアウトしたときだけはその回を諦め、覚えている状態も変えない（「不明」にすると一覧が一瞬消えて戻る）。
//
// 中身の解釈（front matter の文法・台帳の印から `doing` を作る・Beads の状態の読み替え）は契約側の仕事。
// ここは読み直すかどうかの判断と `git`・`bd`・台帳の読み出しだけを持つ。

import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"

import { isDeepEqual } from "remeda"

import { taskSummaryItemsOfBeadsIssues } from "../../../shared/repository/beads-issue.ts"
import {
  parseNewTaskFile,
  taskSummaryItemsOfNewTaskFiles,
  TASK_DIR_PATH,
  type NewTaskFile,
  type TaskSummaryResult,
} from "../../../shared/repository/task-summary.ts"
import { createBeadsStampReader, readBeadsIssues } from "./beads.ts"
import { runGit, runGitCatFileBatch } from "./git.ts"
import { readTaskStoreAt } from "./task-store.ts"

/**
 * 見回りの間隔。`git` は `git rev-parse` 1回が手元で約10msなので、毎回起こしても負荷は無視できる。
 * `bd list` は1回が約0.2秒（CPU）かかるので、Beads 方式のときは間を空ける。
 * タスク一覧はタスクの着手・完了で書き換わるだけなので、秒単位の反映で十分。
 */
export const TASK_SUMMARY_POLL_INTERVALS = {
  git: 1500,
  beads: 5000,
} satisfies TaskSummaryPollIntervals

export type TaskSummaryPollIntervals = {
  /** ファイル方式（と、方式がまだ決まっていないとき）の間隔。 */
  readonly git: number
  /** Beads 方式の間隔。 */
  readonly beads: number
}

/** 完全な参照名で指す（`main` だけだと同名のタグやファイルと曖昧になりうる）。 */
const MAIN_BRANCH_REF = "refs/heads/main"

/**
 * 台帳の置き場（`$(git rev-parse --path-format=absolute --git-common-dir)` の下）の中の、着手の印。
 * 形の正典は task-workflow スキルの `WORKFLOW.md`。
 */
const LEDGER_CLAIM_DIR_SEGMENTS = ["task-workflow", "claim"]

export type TaskSummaryWatcher = {
  /** ポーリングを止める。実行中の見回り（`git`・`bd` の子プロセス）の終わりまで待つ。 */
  readonly close: () => Promise<void>
  /**
   * 見回りを回すかどうか。真にすると、実行中でなければ今すぐ1回読んでから間隔ごとの見回りを再開する。偽にすると次の見回りを予約しない。
   * `close` のあとは何もしない。
   */
  readonly setWatching: (watching: boolean) => void
}

/** 時計の口。`delayMs` 後に `wake` を1回呼び、返した関数で取り消す。 */
export type TaskSummaryClock = {
  readonly after: (delayMs: number, wake: () => void) => () => void
}

/** 見回りが外の世界を読む口。確かめるときは偽に差し替える。 */
export type TaskSummaryPorts = {
  readonly runGit: typeof runGit
  readonly runGitCatFileBatch: typeof runGitCatFileBatch
  readonly readTaskStoreAt: typeof readTaskStoreAt
  readonly readBeadsIssues: typeof readBeadsIssues
  readonly createBeadsStampReader: typeof createBeadsStampReader
  /** 台帳の着手の印の置き場の中の、ディレクトリ名の集合。読めないときは空。 */
  readonly readClaimDir: (claimDir: string) => Promise<ReadonlySet<string>>
  readonly clock: TaskSummaryClock
}

export type TaskSummaryOptions = {
  readonly intervals: TaskSummaryPollIntervals
  readonly ports: TaskSummaryPorts
}

export const REAL_TASK_SUMMARY_PORTS = {
  runGit,
  runGitCatFileBatch,
  readTaskStoreAt,
  readBeadsIssues,
  createBeadsStampReader,
  readClaimDir: readClaimDirEntries,
  clock: {
    after: (delayMs, wake) => {
      const timer = setTimeout(wake, delayMs)
      timer.unref()
      return () => {
        clearTimeout(timer)
      }
    },
  },
} satisfies TaskSummaryPorts

/** 見回りが毎回使う口と、起動中に変わらない値の覚え。 */
type Reader = {
  readonly cwd: string
  readonly ports: TaskSummaryPorts
  readonly readClaimedIds: () => Promise<ReadonlySet<string>>
  readonly readBeadsStamp: () => Promise<string | undefined>
}

/**
 * `main` のタスク一覧を見張り始める。
 * 呼んだ時点で1回見に行き、以後は `setWatching(true)` のあいだ、ポーリングで `main` の先端と台帳の着手の印（Beads 方式なら `bd` の一覧）を見る。
 * 1回の見回りが終わってから次の見回りを予約するので、`git`・`bd` が遅くても見回りは重ならない。
 * `main` が最初から読めない（先端が取れない）ときは `onChange` を呼ばない（初期の姿の `{ kind: "unknown" }` のままでよい）。
 */
export function watchTaskSummary(
  cwd: string,
  onChange: (result: TaskSummaryResult) => void,
  options: TaskSummaryOptions = {
    intervals: TASK_SUMMARY_POLL_INTERVALS,
    ports: REAL_TASK_SUMMARY_PORTS,
  },
): TaskSummaryWatcher {
  const { intervals, ports } = options
  const reader: Reader = {
    cwd,
    ports,
    readClaimedIds: createClaimedIdsReader(cwd, ports),
    readBeadsStamp: ports.createBeadsStampReader(cwd),
  }
  let cache: WatcherCache = { kind: "other", head: undefined }
  let cancelTimer: (() => void) | undefined = undefined
  let watching = false
  let polling = false
  let closed = false
  let runningPoll: Promise<void> = Promise.resolve()

  const poll = async (): Promise<void> => {
    const read = await pollOnce(reader, cache)
    if (closed || read.kind === "unchanged") {
      return
    }
    cache = read.cache
    if (read.kind === "changed") {
      onChange(read.result)
    }
  }

  const loop = (): void => {
    cancelTimer = undefined
    polling = true
    runningPoll = poll()
    void runningPoll.then(() => {
      polling = false
      if (closed || !watching) {
        return
      }
      cancelTimer = ports.clock.after(
        cache.kind === "beads" ? intervals.beads : intervals.git,
        loop,
      )
    })
  }

  loop()

  return {
    close: () => {
      closed = true
      cancelTimer?.()
      return runningPoll
    },
    setWatching: (next) => {
      if (closed || next === watching) {
        return
      }
      watching = next
      if (!next) {
        cancelTimer?.()
        cancelTimer = undefined
        return
      }
      if (!polling) {
        cancelTimer?.()
        loop()
      }
    },
  }
}

/**
 * 見回りのあいだ覚えておく状態。`head` は前回見た `main` の先端。
 * - `task-dir`: ファイル方式で `develop/task/` がある。読んだ front matter とそのときの台帳の印を持つ（先端が動かないあいだ、印だけの変化をファイルを読み直さずに拾うため）
 * - `beads`: Beads 方式。前回知らせた要約と、そのとき読んだ変化の印（取れなければ `undefined`）を持つ（`bd` の読み直しが要るか、変わったかを比べるため）
 * - `other`: それ以外（`develop/task/` が無い・方式の行が読めない・不明）。先端だけ（`main` が読めなければ `undefined`）
 */
type WatcherCache =
  | {
      readonly kind: "task-dir"
      readonly head: string
      readonly files: readonly NewTaskFile[]
      readonly claimedIds: ReadonlySet<string>
    }
  | {
      readonly kind: "beads"
      readonly head: string
      readonly result: TaskSummaryResult
      readonly stamp: string | undefined
    }
  | { readonly kind: "other"; readonly head: string | undefined }

/**
 * 1回の見回りの結果。`refreshed` は知らせるものは無いが、覚える状態だけ差し替える。
 */
type MainTasksRead =
  | { readonly kind: "unchanged" }
  | { readonly kind: "refreshed"; readonly cache: WatcherCache }
  | {
      readonly kind: "changed"
      readonly cache: WatcherCache
      readonly result: TaskSummaryResult
    }

/**
 * `main` の先端を取る。先端が変わっていれば {@link readAtHead} で中身から読み直す。
 * 先端が前回と同じでも、ファイル方式なら台帳の着手の印だけ、Beads 方式なら `bd` の一覧を読み直す（着手・解除・完了は `main` を動かさないため）。
 */
async function pollOnce(reader: Reader, cache: WatcherCache): Promise<MainTasksRead> {
  const revParse = await reader.ports.runGit(reader.cwd, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${MAIN_BRANCH_REF}^{commit}`,
  ])
  if (revParse.kind === "timed-out") {
    return { kind: "unchanged" }
  }

  const head = revParse.kind === "output" ? revParse.stdout.trim() : undefined
  if (head !== cache.head) {
    return readAtHead(reader, head)
  }

  switch (cache.kind) {
    case "other":
      return { kind: "unchanged" }
    case "beads":
      return rereadBeads(reader, cache)
    case "task-dir":
      return rereadClaims(reader, cache)
  }
}

/** ファイル方式で先端が動いていないときの見回り。台帳の印だけを読み直す。 */
async function rereadClaims(
  reader: Reader,
  cache: Extract<WatcherCache, { readonly kind: "task-dir" }>,
): Promise<MainTasksRead> {
  const claimedIds = await reader.readClaimedIds()
  if (setsEqual(claimedIds, cache.claimedIds)) {
    return { kind: "unchanged" }
  }

  return {
    kind: "changed",
    cache: { ...cache, claimedIds },
    result: {
      kind: "known",
      items: taskSummaryItemsOfNewTaskFiles(cache.files, claimedIds),
    },
  }
}

/** Beads 方式で先端が動いていないときの見回り。変化の印が前回と同じなら `bd` を打たず、要約が前回と同じなら知らせない。 */
async function rereadBeads(
  reader: Reader,
  cache: Extract<WatcherCache, { readonly kind: "beads" }>,
): Promise<MainTasksRead> {
  const stamp = await reader.readBeadsStamp()
  if (stamp !== undefined && stamp === cache.stamp) {
    return { kind: "unchanged" }
  }

  const read = await readBeadsAtHead(reader, cache.head, stamp)
  if (read.kind === "unchanged") {
    return read
  }
  if (read.kind === "changed" && isDeepEqual(read.result, cache.result)) {
    return { kind: "refreshed", cache: read.cache }
  }
  return read
}

/**
 * 先端（`head`）が変わったときの読み直し。
 * 中身は先端を取ったコミットから読む（`main` という名前で読むと、2回の `git` の間に `main` が進んだとき、覚える先端と読んだ中身がずれる）。
 * 先に設定ファイルから方式を決め、その方式の読み元だけを読む。
 */
async function readAtHead(reader: Reader, head: string | undefined): Promise<MainTasksRead> {
  if (head === undefined) {
    return unknownAt(head)
  }

  const config = await reader.ports.readTaskStoreAt(reader.cwd, head)
  if (config.kind === "timed-out") {
    return { kind: "unchanged" }
  }
  if (config.kind === "failed") {
    return unknownAt(head)
  }

  switch (config.store.kind) {
    case "invalid":
      return unknownAt(head)
    case "beads":
      return readBeadsAtHead(reader, head, await reader.readBeadsStamp())
    case "files":
      return readTaskDirAtHead(reader, head)
  }
}

/**
 * Beads 方式の一覧を `bd` から読む。
 * `stamp` は `bd list` の前に読んだもの（読んでいるあいだの更新を次の見回りで拾うため）。
 */
async function readBeadsAtHead(
  reader: Reader,
  head: string,
  stamp: string | undefined,
): Promise<MainTasksRead> {
  const beads = await reader.ports.readBeadsIssues(reader.cwd)
  if (beads.kind === "timed-out") {
    return { kind: "unchanged" }
  }

  const result: TaskSummaryResult =
    beads.kind === "issues"
      ? { kind: "known", items: taskSummaryItemsOfBeadsIssues(beads.issues) }
      : { kind: "unknown" }
  return { kind: "changed", cache: { kind: "beads", head, result, stamp }, result }
}

/** ファイル方式の一覧を読む。`develop/task/` が無ければ「不明」にする。 */
async function readTaskDirAtHead(reader: Reader, head: string): Promise<MainTasksRead> {
  const taskDirListing = await reader.ports.runGit(reader.cwd, [
    "ls-tree",
    "--name-only",
    head,
    TASK_DIR_PATH,
  ])
  if (taskDirListing.kind === "timed-out") {
    return { kind: "unchanged" }
  }

  const taskFilePaths =
    taskDirListing.kind === "output" ? taskFilePathsOf(taskDirListing.stdout) : []
  if (taskFilePaths.length === 0) {
    return unknownAt(head)
  }

  return readTasksAtHead(reader, head, taskFilePaths)
}

/** 「不明」にして、先端だけを覚える。 */
function unknownAt(head: string | undefined): MainTasksRead {
  return {
    kind: "changed",
    cache: { kind: "other", head },
    result: { kind: "unknown" },
  }
}

/** `develop/task/` の中身を、1回の `git cat-file --batch` と台帳の着手の印から組み立てる。 */
async function readTasksAtHead(
  reader: Reader,
  head: string,
  taskFilePaths: readonly string[],
): Promise<MainTasksRead> {
  const batch = await reader.ports.runGitCatFileBatch(
    reader.cwd,
    taskFilePaths.map((path) => `${head}:${path}`),
  )
  if (batch.kind === "timed-out") {
    return { kind: "unchanged" }
  }
  if (batch.kind === "failed") {
    return unknownAt(head)
  }

  const files = taskFilePaths.flatMap((path, index) => {
    const content = batch.contents[index]
    return content === undefined ? [] : [{ name: basename(path), content }]
  })
  const parsedFiles = files.flatMap((file) => {
    const task = parseNewTaskFile(file.name, file.content)
    return task === undefined ? [] : [task]
  })

  const claimedIds = await reader.readClaimedIds()
  return {
    kind: "changed",
    cache: { kind: "task-dir", head, files: parsedFiles, claimedIds },
    result: { kind: "known", items: taskSummaryItemsOfNewTaskFiles(parsedFiles, claimedIds) },
  }
}

/**
 * 共有の `.git` の下の台帳から、着手の印がある ID の集合を作る関数を作る。
 * 台帳の置き場（`--git-common-dir` の下）は起動中に変わらないので、取れた1回だけ覚える。取れなかった回は覚えず、次の回にまた試す。
 * 台帳が無い・読めないときは「印なし」に倒す（この一覧は表示だけで、取り合いの判定には使わない）。
 * 台帳が一時的に読めないだけで一覧全体を「不明」にはしない。
 */
function createClaimedIdsReader(
  cwd: string,
  ports: TaskSummaryPorts,
): () => Promise<ReadonlySet<string>> {
  let claimDir: string | undefined = undefined

  return async () => {
    if (claimDir === undefined) {
      const commonDir = await ports.runGit(cwd, [
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      ])
      if (commonDir.kind !== "output") {
        return new Set()
      }
      claimDir = join(commonDir.stdout.trim(), ...LEDGER_CLAIM_DIR_SEGMENTS)
    }
    return ports.readClaimDir(claimDir)
  }
}

async function readClaimDirEntries(claimDir: string): Promise<ReadonlySet<string>> {
  try {
    const entries = await readdir(claimDir, { withFileTypes: true })
    return new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
  } catch {
    return new Set()
  }
}

/** 2つの集合が同じ中身かどうか（順序は見ない）。 */
function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false
    }
  }
  return true
}

/** `git ls-tree --name-only` の出力を、`.md` のパス（`develop/task/T-xxx.md` の形）だけに絞る。 */
function taskFilePathsOf(output: string): readonly string[] {
  return output.split("\n").filter((line) => line.endsWith(".md"))
}
