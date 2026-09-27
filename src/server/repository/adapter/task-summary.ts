// `main` のタスク一覧を見張る。`main` の先端のコミットが変わったとき、台帳の着手の印が
// 変わったとき、または Beads の課題が変わったときに読み直し、`onChange` を呼ぶ。
// 呼び出し側（配線）がこれを `tasks-changed` イベントに変えて、他のセッションの
// イベントと同じ経路へ流す。
//
// どこから読むかは `main` の先端の設定ファイル（AGENTS.md → CLAUDE.md）の `- タスクの置き場:` 行で
// 決める（`readTaskStoreAt`）。作業ツリーの設定ファイルは見ない（`main` へ送るまで方式が変わらない）。
//
// ファイル方式: 読むのは作業ツリーのファイルではなく `main` の上の `develop/task/*.md` の front matter。
// タスクの正典は `main` のもので、作業ツリーのものは `git merge main` するまで別の作業ツリーで
// 足したタスクを知らない。`git ls-tree` で列挙し、`git cat-file --batch` で1回の子プロセスで
// まとめて読む。着手中はファイルに書かれない。台帳の着手の印（`task claim` / `task release`）は
// 共有の `.git` の下だけで完結し、`main` を動かさないので、`main` の先端が同じ見回りでも
// `task-workflow/claim/` の一覧だけは毎回読み直し、前回と変わっていれば `onChange` する。
// このときファイルは読み直さず、前回読んだ front matter（`NewTaskFile[]`）に新しい印の集合を
// 当て直すだけにする（`taskSummaryItemsOfNewTaskFiles`）。
//
// Beads 方式: `bd list`（`readBeadsIssues`）を見回りのたびに打ち、要約が前回と変わっていれば
// `onChange` する。着手・完了は `main` を動かさないので、先端が同じでも読み直す。`bd` は1回が
// `git rev-parse` より2桁重いので、見回りの間隔を長くする（`TASK_SUMMARY_POLL_INTERVALS`）。
//
// `main` が読めないとき（git リポジトリでない・`main` ブランチが無い・`git` が無い）、
// ファイル方式で `develop/task/` が無いとき、Beads 方式で `bd` が読めないとき、方式の行が
// 読めないときは「不明」にする。作業ツリーのファイルへは落とさない。落とすと読み元が2つになり、
// `main` の名前が違うリポジトリで一覧が黙って古いほうへ戻る（「不明」なら画面で気付ける）。
// `git`・`bd` がタイムアウトしたときだけはその回を諦め、覚えている状態も変えない（一時的な失敗
// なので次の回で読み直す。「不明」にすると一覧が一瞬消えて戻る）。
//
// 中身の解釈（front matter の文法・台帳の印から `doing` を作る・Beads の状態の読み替え）は
// 契約側の仕事で、ここは読み直すかどうかの判断と `git`・`bd`・台帳の読み出しだけを持つ。

import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"

import { isDeepEqual } from "remeda"

import { taskSummaryItemsOfBeadsIssues } from "../../../shared/repository/beads-issue.ts"
import {
  parseNewTaskFile,
  taskSummaryItemsOfNewTaskFiles,
  type NewTaskFile,
  type TaskSummaryResult,
} from "../../../shared/repository/task-summary.ts"
import { readBeadsIssues } from "./beads.ts"
import { runGit, runGitCatFileBatch } from "./git.ts"
import { readTaskStoreAt } from "./task-store.ts"

/**
 * 見回りの間隔。`git` は `git rev-parse` 1回が手元で約10msなので、毎回起こしても負荷は無視できる。
 * `bd list` は1回が約0.2秒（CPU）かかるので、Beads 方式のときは間を空ける。タスク一覧はタスクの
 * 着手・完了で書き換わるだけなので、秒単位の反映で十分（`docs/requirements.md`「5. 実行環境・
 * 非機能要件」の1秒目安とは別枠）。
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

/** 末尾の `/` を付けて `git ls-tree` に渡すと、そのディレクトリ自身の1行ではなく直下の一覧になる。 */
const TASK_DIR_PATH = "develop/task/"

/** 台帳の置き場（`$(git rev-parse --path-format=absolute --git-common-dir)` の下）の中の、
 * 着手の印（claude-skills の `docs/task-workflow-redesign.md`）。 */
const LEDGER_CLAIM_DIR_SEGMENTS = ["task-workflow", "claim"]

export type TaskSummaryWatcher = {
  /** ポーリングを止める。 */
  readonly close: () => void
}

/**
 * `main` のタスク一覧を見張り始める。呼んだ時点で1回見に行き、以後はポーリングで
 * `main` の先端と台帳の着手の印（Beads 方式なら `bd` の一覧）を見る。 1回の見回りが終わってから次の
 * 見回りを予約するので、`git`・`bd` が遅くても見回りは重ならない。
 * `main` が最初から読めない（先端が取れない）ときは `onChange` を呼ばない（先端が「無い→無い」で
 * 変わっていないため。`INITIAL_SESSION_STATE.tasks` の既定値 `{ kind: "unknown" }` と一致するので、
 * 呼ばなくても見た目は変わらない）。
 *
 * `pollIntervals` は既定 {@link TASK_SUMMARY_POLL_INTERVALS}。テストが実際の間隔を待たずに
 * 済むよう、`batchIntervalMs` と同じ形で差し替えられるようにしてある。
 */
export function watchTaskSummary(
  cwd: string,
  onChange: (result: TaskSummaryResult) => void,
  pollIntervals: TaskSummaryPollIntervals = TASK_SUMMARY_POLL_INTERVALS,
): TaskSummaryWatcher {
  let cache: WatcherCache = { kind: "other", head: undefined }
  let timer: ReturnType<typeof setTimeout> | undefined = undefined
  let closed = false

  const poll = async (): Promise<void> => {
    const read = await pollOnce(cwd, cache)
    if (closed || read.kind === "unchanged") {
      return
    }
    cache = read.cache
    onChange(read.result)
  }

  const loop = (): void => {
    void poll().then(() => {
      if (closed) {
        return
      }
      timer = setTimeout(loop, cache.kind === "beads" ? pollIntervals.beads : pollIntervals.git)
      timer.unref()
    })
  }

  loop()

  return {
    close: () => {
      closed = true
      clearTimeout(timer)
    },
  }
}

/**
 * 見回りのあいだ覚えておく状態。`head` は前回見た `main` の先端。
 * - `task-dir`: ファイル方式で `develop/task/` がある。`git cat-file --batch` で読んだ front matter と
 *   そのときの台帳の印を持つ（先端が動かないあいだ、印だけの変化をファイルを読み直さずに拾うため）
 * - `beads`: Beads 方式。前回知らせた要約を持つ（`bd` の読み直しで変わったかを比べるため）
 * - `other`: それ以外（`develop/task/` が無い・方式の行が読めない・不明）。先端だけ
 *   （`main` が読めなければ `undefined`）
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
    }
  | { readonly kind: "other"; readonly head: string | undefined }

/** 1回の見回りの結果。 */
type MainTasksRead =
  | { readonly kind: "unchanged" }
  | {
      readonly kind: "changed"
      readonly cache: WatcherCache
      readonly result: TaskSummaryResult
    }

/**
 * `main` の先端を取る。先端が変わっていれば {@link readAtHead} で中身から読み直す。先端が前回と
 * 同じでも、ファイル方式なら台帳の着手の印だけ、Beads 方式なら `bd` の一覧を読み直す
 * （着手・解除・完了は `main` を動かさないため）。
 */
async function pollOnce(cwd: string, cache: WatcherCache): Promise<MainTasksRead> {
  const revParse = await runGit(cwd, [
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
    return readAtHead(cwd, head)
  }

  switch (cache.kind) {
    case "other":
      return { kind: "unchanged" }
    case "beads":
      return rereadBeads(cwd, cache)
    case "task-dir":
      return rereadClaims(cwd, cache)
  }
}

/** ファイル方式で先端が動いていないときの見回り。台帳の印だけを読み直す。 */
async function rereadClaims(
  cwd: string,
  cache: Extract<WatcherCache, { readonly kind: "task-dir" }>,
): Promise<MainTasksRead> {
  const claimedIds = await readClaimedTaskIds(cwd)
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

/** Beads 方式で先端が動いていないときの見回り。要約が前回と同じなら知らせない。 */
async function rereadBeads(
  cwd: string,
  cache: Extract<WatcherCache, { readonly kind: "beads" }>,
): Promise<MainTasksRead> {
  const read = await readBeadsAtHead(cwd, cache.head)
  if (read.kind === "unchanged" || isDeepEqual(read.result, cache.result)) {
    return { kind: "unchanged" }
  }
  return read
}

/**
 * 先端（`head`）が変わったときの読み直し。中身は先端を取ったコミットから読む（`main` という
 * 名前で読むと、2回の `git` の間に `main` が進んだとき、覚える先端と読んだ中身がずれる）。
 * 先に設定ファイルから方式を決め、その方式の読み元だけを読む。
 */
async function readAtHead(cwd: string, head: string | undefined): Promise<MainTasksRead> {
  if (head === undefined) {
    return unknownAt(head)
  }

  const config = await readTaskStoreAt(cwd, head)
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
      return readBeadsAtHead(cwd, head)
    case "files":
      return readTaskDirAtHead(cwd, head)
  }
}

/** Beads 方式の一覧を `bd` から読む。 */
async function readBeadsAtHead(cwd: string, head: string): Promise<MainTasksRead> {
  const beads = await readBeadsIssues(cwd)
  if (beads.kind === "timed-out") {
    return { kind: "unchanged" }
  }

  const result: TaskSummaryResult =
    beads.kind === "issues"
      ? { kind: "known", items: taskSummaryItemsOfBeadsIssues(beads.issues) }
      : { kind: "unknown" }
  return { kind: "changed", cache: { kind: "beads", head, result }, result }
}

/** ファイル方式の一覧を読む。`develop/task/` が無ければ「不明」にする。 */
async function readTaskDirAtHead(cwd: string, head: string): Promise<MainTasksRead> {
  const taskDirListing = await runGit(cwd, ["ls-tree", "--name-only", head, TASK_DIR_PATH])
  if (taskDirListing.kind === "timed-out") {
    return { kind: "unchanged" }
  }

  const taskFilePaths =
    taskDirListing.kind === "output" ? taskFilePathsOf(taskDirListing.stdout) : []
  if (taskFilePaths.length === 0) {
    return unknownAt(head)
  }

  return readTasksAtHead(cwd, head, taskFilePaths)
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
  cwd: string,
  head: string,
  taskFilePaths: readonly string[],
): Promise<MainTasksRead> {
  const batch = await runGitCatFileBatch(
    cwd,
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

  const claimedIds = await readClaimedTaskIds(cwd)
  return {
    kind: "changed",
    cache: { kind: "task-dir", head, files: parsedFiles, claimedIds },
    result: { kind: "known", items: taskSummaryItemsOfNewTaskFiles(parsedFiles, claimedIds) },
  }
}

/** 共有の `.git` の下の台帳から、着手の印がある ID の集合を作る。台帳が無い・読めないときは
 * 「印なし」に倒す（この一覧は表示だけで、台帳が正典の取り合いの判定には使わない。台帳が
 * 一時的に読めないだけで一覧全体を「不明」にはしない）。 */
async function readClaimedTaskIds(cwd: string): Promise<ReadonlySet<string>> {
  const commonDir = await runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  if (commonDir.kind !== "output") {
    return new Set()
  }

  const claimDir = join(commonDir.stdout.trim(), ...LEDGER_CLAIM_DIR_SEGMENTS)
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
