// `main` のタスク一覧を見張る。`main` の先端のコミットが変わったとき、**または台帳の
// 着手の印が変わったとき**に読み直し、`onChange` を呼ぶ（docs/design.md 5章「task-summary.ts」）。
// 呼び出し側（src/session-start.ts）がこれを `tasks-changed` イベントに変えて、他のセッションの
// イベントと同じ経路へ流す。
//
// **読むのは作業ツリーのファイルではなく `main` の上のもの**。タスクの正典は `main` のもので、
// 作業ツリーのものは `git merge main` するまで別の作業ツリーで足したタスクを知らない。**境界は
// 「`main` の上のタスク一覧」の1つ**。`git` を起こすのは `src/server/adapter/git.ts`
// （`node:child_process` を import してよいファイルは `test/architecture.test.ts` が絞っている。
// 成果の集計（`main-history.ts`）と同じ口を使う）。`main` の上のファイルを読む汎用の adapter を
// 別に切らないのは、読み手がこの一覧しかなく、切っても開くファイルが増えるだけで概念が増えない
// ため。
//
// **読むのは `develop/task/*.md` の front matter だけ**（claude-skills の
// `docs/task-workflow-redesign.md`。develop/tasks.json の読み方は後から消した）:
// `main` に `develop/task/` があれば、そこの `*.md` を1件ずつ front matter として
// 読む（`git ls-tree` で列挙し、`git cat-file --batch` で1回の子プロセスでまとめて読む）。
// 着手中（旧 `doing`）はファイルに書かれない。**台帳の着手の印（`task claim` / `task release`）は
// 共有の `.git` の下だけで完結し、`main` を動かさない**（claude-skills の
// `docs/task-workflow-redesign.md` 4.2）ので、`main` の先端が同じ見回りでも
// `task-workflow/claim/` の一覧だけは毎回読み直し、前回と変わっていれば
// `onChange` する。**このときファイルは読み直さない**——`git cat-file --batch` は先端が
// 動いたときだけで足りるので、前回読んだ front matter（`NewTaskFile[]`）に新しい印の集合を
// 当て直すだけにする（`src/shared/task-summary.ts` の `taskSummaryItemsOfNewTaskFiles`）
//
// **`main` が読めないとき（git リポジトリでない・`main` ブランチが無い・`git` が無い）、
// `develop/task/` が無いときは「不明」にする。** 作業ツリーのファイルへは落とさない。落とすと
// 読み元が2つになり、`main` の名前が違うリポジトリで一覧が黙って古いほうへ戻る（「不明」なら
// 画面で気付ける）。tsukumo を他のプロジェクトで起こしたときは `develop/task/` が無いので「不明」になる。
// **`git` がタイムアウトしたときだけはその回を諦め、覚えている状態も変えない**（一時的な失敗なので
// 次の回で読み直す。「不明」にすると一覧が一瞬消えて戻る）。
//
// 中身の解釈（front matter の文法・台帳の印から `doing` を作る）は src/shared/task-summary.ts の
// 仕事で、ここは読み直すかどうかの判断と `git`・台帳の読み出しだけを持つ。

import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"

import {
  parseNewTaskFile,
  taskSummaryItemsOfNewTaskFiles,
  type NewTaskFile,
  type TaskSummaryResult,
} from "../../shared/task-summary.ts"
import { runGit, runGitCatFileBatch } from "./git.ts"

/** 見回りの間隔。`git rev-parse` 1回は手元で約10msなので、この間隔なら毎回起こしても
 * 負荷は無視できる。タスク一覧はタスクの着手・完了で書き換わるだけなので、秒単位の
 * 反映で十分（`docs/requirements.md`「5. 実行環境・非機能要件」の1秒目安とは別枠）。 */
export const TASK_SUMMARY_POLL_INTERVAL_MS = 1500

/** 完全な参照名で指す（`main` だけだと同名のタグやファイルと曖昧になりうる）。 */
const MAIN_BRANCH_REF = "refs/heads/main"

/** 末尾の `/` を付けて `git ls-tree` に渡すと、そのディレクトリ自身の1行ではなく直下の一覧になる。 */
const TASK_DIR_PATH = "develop/task/"

/** 台帳の置き場（`$(git rev-parse --path-format=absolute --git-common-dir)` の下）の中の、
 * 着手の印（claude-skills の `docs/task-workflow-redesign.md` 4.2）。 */
const LEDGER_CLAIM_DIR_SEGMENTS = ["task-workflow", "claim"]

export type TaskSummaryWatcher = {
  /** ポーリングを止める。 */
  readonly close: () => void
}

/**
 * `main` のタスク一覧を見張り始める。**呼んだ時点で1回見に行き、以後はポーリングで
 * `main` の先端と台帳の着手の印を見る。** 1回の見回りが終わってから次の
 * 見回りを予約するので、`git` が遅くても見回りは重ならない。
 * `main` が最初から読めない（先端が取れない）ときは `onChange` を呼ばない（先端が「無い→無い」で
 * 変わっていないため。`INITIAL_SESSION_STATE.tasks` の既定値 `{ kind: "unknown" }` と一致するので、
 * 呼ばなくても見た目は変わらない）。
 *
 * `pollIntervalMs` は既定 {@link TASK_SUMMARY_POLL_INTERVAL_MS}。テストが実際の間隔を待たずに
 * 済むよう、`src/server/core/session-manager.ts` の `batchIntervalMs` と同じ形で差し替えられるようにしてある。
 */
export function watchTaskSummary(
  cwd: string,
  onChange: (result: TaskSummaryResult) => void,
  pollIntervalMs = TASK_SUMMARY_POLL_INTERVAL_MS,
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
      timer = setTimeout(loop, pollIntervalMs)
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
 * 見回りのあいだ覚えておく状態。`head` は前回見た `main` の先端。**`develop/task/` があるときだけ**
 * `git cat-file --batch` で読んだ front matter とそのときの台帳の印を持つ（先端が動かないあいだ、
 * 印だけの変化をファイルを読み直さずに拾うため）。`develop/task/` が無い・不明のときは先端だけ
 * （`main` が読めなければ `undefined`）。
 */
type WatcherCache =
  | {
      readonly kind: "task-dir"
      readonly head: string
      readonly files: readonly NewTaskFile[]
      readonly claimedIds: ReadonlySet<string>
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
 * `main` の先端を取る。**先端が前回と同じでも、`develop/task/` を見ているときは台帳の着手の印だけ
 * 読み直す**（着手・解除は `main` を動かさないため）。先端が変わっていれば {@link readAtHead} で
 * 中身から読み直す。
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

  if (cache.kind === "other") {
    return { kind: "unchanged" }
  }

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

/**
 * 先端（`head`）が変わったときの読み直し。中身は先端を取ったコミットから読む（`main` という
 * 名前で読むと、2回の `git` の間に `main` が進んだとき、覚える先端と読んだ中身がずれる）。
 * `develop/task/` が無ければ「不明」にする。
 */
async function readAtHead(cwd: string, head: string | undefined): Promise<MainTasksRead> {
  if (head === undefined) {
    return { kind: "changed", cache: { kind: "other", head }, result: { kind: "unknown" } }
  }

  const taskDirListing = await runGit(cwd, ["ls-tree", "--name-only", head, TASK_DIR_PATH])
  if (taskDirListing.kind === "timed-out") {
    return { kind: "unchanged" }
  }

  const taskFilePaths =
    taskDirListing.kind === "output" ? taskFilePathsOf(taskDirListing.stdout) : []
  if (taskFilePaths.length === 0) {
    return { kind: "changed", cache: { kind: "other", head }, result: { kind: "unknown" } }
  }

  return readTasksAtHead(cwd, head, taskFilePaths)
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
    return { kind: "changed", cache: { kind: "other", head }, result: { kind: "unknown" } }
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

/** 共有の `.git` の下の台帳から、着手の印がある ID の集合を作る。**台帳が無い・読めないときは
 * 「印なし」に倒す**（この一覧は表示だけで、台帳が正典の取り合いの判定には使わない。台帳が
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
