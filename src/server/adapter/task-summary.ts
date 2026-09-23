// `main` ブランチの develop/tasks.json を見張る。`main` の先端のコミットが変わったときだけ
// 読み直し、`onChange` を呼ぶ（docs/design.md 5章「task-summary.ts」）。呼び出し側
// （src/session-start.ts）がこれを `tasks-changed` イベントに変えて、他のセッションのイベントと
// 同じ経路へ流す。
//
// **読むのは作業ツリーのファイルではなく `main` の上のもの**。タスクの正典は `main` の
// develop/tasks.json で（CLAUDE.md「## タスク運用」）、作業ツリーのものは `git merge main` するまで
// 別の作業ツリーで足したタスクを知らない。**境界は「`main` の上のタスク一覧」の1つ**で、
// そのために `git` を起こす（`node:child_process` を import してよいファイルは
// `test/architecture.test.ts` が絞っている）。`main` の上のファイルを読む汎用の adapter を別に
// 切らないのは、読み手がこの一覧しかなく、切っても開くファイルが増えるだけで概念が増えないため。
//
// **`main` が読めないとき（git リポジトリでない・`main` ブランチが無い・`main` に
// develop/tasks.json が無い・`git` が無い）は「不明」にする。作業ツリーのファイルへは落とさない。**
// 落とすと読み元が2つになり、`main` の名前が違うリポジトリで一覧が黙って古いほうへ戻る
// （「不明」なら画面で気付ける）。tsukumo を他のプロジェクトで起こしたときは develop/tasks.json
// がそもそも無いので、どちらでも「不明」になる。
// **`git` がタイムアウトしたときだけはその回を諦め、覚えている先端も変えない**（一時的な失敗なので
// 次の回で読み直す。「不明」にすると一覧が一瞬消えて戻る）。
//
// 中身の解釈は src/shared/task-summary.ts の `readTaskSummaries` の仕事で、ここは読み直すかどうかの
// 判断と `git` の呼び出しだけを持つ。

import { execFile } from "node:child_process"

import { readTaskSummaries, type TaskSummaryResult } from "../../shared/task-summary.ts"

/** 先端を見に行く間隔。`git rev-parse` 1回は手元で約10msなので、この間隔なら毎回起こしても
 * 負荷は無視できる。develop/tasks.json はタスクの着手・完了で書き換わるだけなので、秒単位の
 * 反映で十分（`docs/requirements.md`「5. 実行環境・非機能要件」の1秒目安とは別枠）。 */
export const TASK_SUMMARY_POLL_INTERVAL_MS = 1500

/** 完全な参照名で指す（`main` だけだと同名のタグやファイルと曖昧になりうる）。 */
const MAIN_BRANCH_REF = "refs/heads/main"

/** `./` から始めると `git show` は cwd からの相対で解く（サブディレクトリで起こしたときも、
 * 作業ツリーのファイルを読んでいたころと同じ基準になる）。 */
const TASKS_FILE_PATH = "./develop/tasks.json"

/** `git` の応答を待つ上限。超えたらその回を諦める（上のコメント）。 */
const GIT_TIMEOUT_MS = 5000

/** 受け取る標準出力の上限。超えると `git` の呼び出しごと失敗し、「不明」になる。 */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

export type TaskSummaryWatcher = {
  /** ポーリングを止める。 */
  readonly close: () => void
}

/**
 * `main` の develop/tasks.json を見張り始める。**呼んだ時点で1回見に行き、以後はポーリングで
 * `main` の先端を見る。** 1回の見回りが終わってから次の見回りを予約するので、`git` が遅くても
 * 見回りは重ならない。
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
  let cachedHead: string | undefined = undefined
  let timer: ReturnType<typeof setTimeout> | undefined = undefined
  let closed = false

  const poll = async (): Promise<void> => {
    const read = await readMainTasks(cwd, cachedHead)
    if (closed || read.kind === "unchanged") {
      return
    }
    cachedHead = read.head
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

/** 1回の見回りの結果。`head` は次の回で比べる先端（`main` が読めなければ `undefined`）。 */
type MainTasksRead =
  | { readonly kind: "unchanged" }
  | {
      readonly kind: "changed"
      readonly head: string | undefined
      readonly result: TaskSummaryResult
    }

/** `git` 1回の結果。タイムアウトだけを分けるのは、その回を諦めるか「不明」にするかが変わるため。 */
type GitOutcome =
  | { readonly kind: "output"; readonly stdout: string }
  | { readonly kind: "failed" }
  | { readonly kind: "timed-out" }

/**
 * `main` の先端を取り、`cachedHead` から変わっていれば develop/tasks.json を読む。
 * 中身は先端を取ったコミットから読む（`main` という名前で読むと、2回の `git` の間に `main` が
 * 進んだとき、覚える先端と読んだ中身がずれる）。
 */
async function readMainTasks(cwd: string, cachedHead: string | undefined): Promise<MainTasksRead> {
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
  if (head === cachedHead) {
    return { kind: "unchanged" }
  }
  if (head === undefined) {
    return { kind: "changed", head, result: { kind: "unknown" } }
  }

  const show = await runGit(cwd, ["show", `${head}:${TASKS_FILE_PATH}`])
  switch (show.kind) {
    case "timed-out":
      return { kind: "unchanged" }
    case "failed":
      return { kind: "changed", head, result: { kind: "unknown" } }
    case "output":
      return { kind: "changed", head, result: taskSummaryResultOf(show.stdout) }
  }
}

function taskSummaryResultOf(content: string): TaskSummaryResult {
  const items = readTaskSummaries(content)
  return items === undefined ? { kind: "unknown" } : { kind: "known", items }
}

/** `git` を起こす。**例外を投げない**（失敗は `failed` / `timed-out` として返す）。 */
function runGit(cwd: string, args: readonly string[]): Promise<GitOutcome> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout) => {
        if (error === null) {
          resolve({ kind: "output", stdout })
        } else {
          // `timeout` で打ち切られたときだけ `killed` が立つ（終了コードが 0 でないときは立たない）。
          resolve({ kind: error.killed === true ? "timed-out" : "failed" })
        }
      },
    )
  })
}
