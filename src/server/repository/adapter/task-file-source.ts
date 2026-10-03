// ファイル方式のタスクの読み元。
// 読むのは作業ツリーのファイルではなく、主ブランチの上の `develop/task/*.md` の front matter。
// 作業ツリーのものは `git merge main` するまで別の作業ツリーで足したタスクを知らない。
// `git ls-tree` で列挙し、`git cat-file --batch` で1回の子プロセスでまとめて読む。
//
// 着手中はファイルに書かれない。台帳の着手の印（`task claim` / `task release`）は共有の `.git` の下だけで完結し、主ブランチを動かさない。
// そのため先端が前回と同じ見回りでも `task-workflow/claim/` の一覧だけは毎回読み直す。
// このときファイルは読み直さず、前回読んだ front matter に新しい印の集合を当て直すだけにする。
//
// 主ブランチが読めないとき（git リポジトリでない・設定の名前のブランチが無い・`git` が無い）と `develop/task/` が無いときは「不明」にする。
// 作業ツリーのファイルへは落とさない。落とすと読み元が2つになり、一覧が黙って古いほうへ戻る（「不明」なら画面で気付ける）。
// `git` がタイムアウトしたときはその回を諦め、覚えている状態も変えない（「不明」にすると一覧が一瞬消えて戻る）。
//
// 中身の解釈（front matter の文法・台帳の印から `doing` を作る）は契約側の仕事。
// ここは読み直すかどうかの判断と `git`・台帳の読み出しだけを持つ。

import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"

import {
  parseNewTaskFile,
  taskSummaryItemsOfNewTaskFiles,
  TASK_DIR_PATH,
  type NewTaskFile,
  type TaskSummaryResult,
} from "../../../shared/repository/task-summary.ts"
import type { runGit, runGitCatFileBatch } from "./git.ts"
import type { TaskSource } from "./task-source.ts"

/**
 * 台帳の置き場（`$(git rev-parse --path-format=absolute --git-common-dir)` の下）の中の、着手の印。
 * 形の正典は task-workflow スキルの `WORKFLOW.md`。
 */
const LEDGER_CLAIM_DIR_SEGMENTS = ["task-workflow", "claim"]

export type TaskFileSourcePorts = {
  readonly runGit: typeof runGit
  readonly runGitCatFileBatch: typeof runGitCatFileBatch
  /** 台帳の着手の印がある ID の集合（{@link createClaimedIdsReader}）。 */
  readonly readClaimedIds: () => Promise<ReadonlySet<string>>
}

/** `mainBranchRef` は完全な参照名（`refs/heads/<名前>`）。 */
export function createTaskFileSource(
  cwd: string,
  mainBranchRef: string,
  ports: TaskFileSourcePorts,
): TaskSource {
  const reader: Reader = { cwd, mainBranchRef, ports }
  let memo: FileSourceMemo = { kind: "unread" }

  return {
    read: async () => {
      const step = await readOnce(reader, memo)
      if (step.kind === "unchanged") {
        return step
      }
      memo = step.memo
      return { kind: "read", result: step.result }
    },
  }
}

/**
 * 共有の `.git` の下の台帳から、着手の印がある ID の集合を作る関数を作る。
 * 台帳の置き場（`--git-common-dir` の下）は起動中に変わらないので、取れた1回だけ覚える。取れなかった回は覚えず、次の回にまた試す。
 * 台帳が無い・読めないときは「印なし」に倒す（この一覧は表示だけで、取り合いの判定には使わない）。
 * 台帳が一時的に読めないだけで一覧全体を「不明」にはしない。
 */
export function createClaimedIdsReader(
  cwd: string,
  ports: {
    readonly runGit: typeof runGit
    readonly readClaimDir: (claimDir: string) => Promise<ReadonlySet<string>>
  },
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

/** 台帳の着手の印の置き場の中の、ディレクトリ名の集合。読めないときは空。 */
export async function readClaimDirEntries(claimDir: string): Promise<ReadonlySet<string>> {
  try {
    const entries = await readdir(claimDir, { withFileTypes: true })
    return new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
  } catch {
    return new Set()
  }
}

type Reader = {
  readonly cwd: string
  readonly mainBranchRef: string
  readonly ports: TaskFileSourcePorts
}

/**
 * 前回の見回りで読んだもの。
 * - `unread`: まだ読んでいない、または主ブランチが読めなかった
 * - `no-tasks`: その先端に `develop/task/` が無い・読めなかった
 * - `tasks`: その先端の front matter と、そのときの台帳の印（先端が動かないあいだ、印だけの変化をファイルを読み直さずに拾うため）
 */
type FileSourceMemo =
  | { readonly kind: "unread" }
  | { readonly kind: "no-tasks"; readonly head: string }
  | {
      readonly kind: "tasks"
      readonly head: string
      readonly files: readonly NewTaskFile[]
      readonly claimedIds: ReadonlySet<string>
    }

/** 1回の見回りの結果に、次に覚えるものを添えたもの。 */
type FileSourceStep =
  | { readonly kind: "unchanged" }
  | { readonly kind: "read"; readonly memo: FileSourceMemo; readonly result: TaskSummaryResult }

const UNCHANGED = { kind: "unchanged" } as const satisfies FileSourceStep

/** 先端が前回と違えば中身から読み直し、同じなら台帳の印だけを読み直す。 */
async function readOnce(reader: Reader, memo: FileSourceMemo): Promise<FileSourceStep> {
  const head = await readHead(reader)
  if (head === "timed-out") {
    return UNCHANGED
  }
  if (head === undefined) {
    return { kind: "read", memo: { kind: "unread" }, result: { kind: "unknown" } }
  }
  if (memo.kind === "unread" || memo.head !== head) {
    return readAtHead(reader, head)
  }

  switch (memo.kind) {
    case "no-tasks":
      return UNCHANGED
    case "tasks":
      return rereadClaims(reader, memo)
  }
}

/** 主ブランチの先端。取れなければ `undefined`。 */
async function readHead(reader: Reader): Promise<string | undefined | "timed-out"> {
  const revParse = await reader.ports.runGit(reader.cwd, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${reader.mainBranchRef}^{commit}`,
  ])
  if (revParse.kind === "timed-out") {
    return "timed-out"
  }
  return revParse.kind === "output" ? revParse.stdout.trim() : undefined
}

/** 先端が動いていないときの見回り。台帳の印だけを読み直す。 */
async function rereadClaims(
  reader: Reader,
  memo: Extract<FileSourceMemo, { readonly kind: "tasks" }>,
): Promise<FileSourceStep> {
  const claimedIds = await reader.ports.readClaimedIds()
  if (setsEqual(claimedIds, memo.claimedIds)) {
    return UNCHANGED
  }

  return {
    kind: "read",
    memo: { ...memo, claimedIds },
    result: { kind: "known", items: taskSummaryItemsOfNewTaskFiles(memo.files, claimedIds) },
  }
}

/**
 * 先端が変わったときの読み直し。
 * 中身は先端を取ったコミットから読む（主ブランチの名前で読むと、2回の `git` の間に主ブランチが進んだとき、覚える先端と読んだ中身がずれる）。
 */
async function readAtHead(reader: Reader, head: string): Promise<FileSourceStep> {
  const taskDirListing = await reader.ports.runGit(reader.cwd, [
    "ls-tree",
    "--name-only",
    head,
    TASK_DIR_PATH,
  ])
  if (taskDirListing.kind === "timed-out") {
    return UNCHANGED
  }

  const taskFilePaths =
    taskDirListing.kind === "output" ? taskFilePathsOf(taskDirListing.stdout) : []
  if (taskFilePaths.length === 0) {
    return noTasksAt(head)
  }

  const batch = await reader.ports.runGitCatFileBatch(
    reader.cwd,
    taskFilePaths.map((path) => `${head}:${path}`),
  )
  if (batch.kind === "timed-out") {
    return UNCHANGED
  }
  if (batch.kind === "failed") {
    return noTasksAt(head)
  }

  const files = taskFilePaths.flatMap((path, index) => {
    const content = batch.contents[index]
    if (content === undefined) {
      return []
    }
    const task = parseNewTaskFile(basename(path), content)
    return task === undefined ? [] : [task]
  })
  const claimedIds = await reader.ports.readClaimedIds()
  return {
    kind: "read",
    memo: { kind: "tasks", head, files, claimedIds },
    result: { kind: "known", items: taskSummaryItemsOfNewTaskFiles(files, claimedIds) },
  }
}

function noTasksAt(head: string): FileSourceStep {
  return { kind: "read", memo: { kind: "no-tasks", head }, result: { kind: "unknown" } }
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
