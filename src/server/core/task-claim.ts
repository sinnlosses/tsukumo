// タスクの着手の印（`docs/architecture.md`「worktree でセッションを分ける」の決定3）。
// **worktree で分けるとファイルの衝突は起きなくなる**ので、印が防ぐのは「同じタスクを2つの
// セッションが取らない」ことだけ。ここは**印に何を書くか・読めた印をどうするか**の判断だけを持ち、
// 実際にファイルへ置くのは `src/server/adapter/mark.ts`（原則3。`core → adapter` は禁止）。
//
// 印に書くのは**タスクid・pid・取った時刻・作業先**の4つだけで、**会話の内容は書かない**
// （`docs/coding-standards.md`「会話内容の扱い」）。

import { isPlainObject } from "remeda"

import { type Workdir } from "../../shared/workspace.ts"

/**
 * 着手の印1つの中身。**pid が持ち主**で、生きているかどうかが取れる／取れないを決める
 * （{@link decideTaskMark}）。`claimedAt` と `workdir` は**人が読むため**に書く——
 * 取れなかったときに「どのセッションが、いつから取っているのか」が分からないと動きようがない。
 */
export type TaskMark = {
  readonly taskId: string
  /** 取ったセッション（tsukumo のプロセス）の pid。 */
  readonly pid: number
  /** 取った時刻（オフセット付きの ISO。**比べるのには使わない**。表示だけ）。 */
  readonly claimedAt: string
  /** 取ったセッションの作業先（切った worktree なら、そのブランチと切り出し元も入る）。 */
  readonly workdir: Workdir
}

/**
 * 置き場にあった印1つの、いま分かっていること（pid の生死を調べるのは adapter）。
 * **読めなかった印もここで1つの状態として扱う**ので、判断の側に「無いかもしれない」が漏れない。
 */
export type TaskMarkState =
  /** JSON として読めない・形が違う印（落ちたセッションの書きかけなど）。 */
  | { readonly kind: "unreadable" }
  | { readonly kind: "found"; readonly mark: TaskMark; readonly running: boolean }

/** 置き場にあった印1つをどうするか。 */
export type TaskMarkFate =
  /** 生きているセッションが取っている。**触らない。** */
  | { readonly kind: "held" }
  /** 落ちたセッションの取り残し。**次に取りに来たセッションが掃除する。** */
  | { readonly kind: "stale" }

/** タスクを取りに行った結果。 */
export type TaskClaim =
  /** 取れた。**終えたら印を返す**（`releaseTask`）。 */
  | { readonly kind: "claimed"; readonly mark: TaskMark }
  /** 生きているセッションが先に取っていた。**取りに来た側は着手しない。** */
  | { readonly kind: "held"; readonly by: TaskMark }
  /** 印を置けなかった（置き場が無い・書けない・置かれていたものが読めない）。 */
  | { readonly kind: "failed"; readonly reason: string }

/**
 * 置き場にあった印1つをどうするかを決める（`decideWorktreeFold` と同じ形）。
 *
 * **読めない印は掃除する側へ倒す**——読めないものを残すと、そのタスクが誰にも取れないまま
 * 止まる。書きかけの印を消してしまう余地はあるが、**その印の持ち主は「取れた」と思っていない**
 * （取れたと決まるのはファイルを作れたときだけ）ので、二重着手にはならない。
 */
export function decideTaskMark(state: TaskMarkState): TaskMarkFate {
  if (state.kind === "unreadable") {
    return { kind: "stale" }
  }
  return state.running ? { kind: "held" } : { kind: "stale" }
}

/**
 * 印に書く文面（JSON。**人が開いて読める**ように改行を入れる）。ファイルへ置くのは adapter。
 */
export function writeTaskMark(mark: TaskMark): string {
  return `${JSON.stringify(mark, undefined, 2)}\n`
}

/**
 * 置かれていた印を読む。**形が違えば undefined**（呼び出し側が
 * {@link TaskMarkState} の `unreadable` へ畳む）。
 */
export function readTaskMark(written: string): TaskMark | undefined {
  const parsed = parseJson(written)
  if (!isPlainObject(parsed)) {
    return undefined
  }

  const taskId = parsed["taskId"]
  const pid = parsed["pid"]
  const claimedAt = parsed["claimedAt"]
  const workdir = toWorkdir(parsed["workdir"])
  if (
    typeof taskId !== "string" ||
    taskId === "" ||
    typeof pid !== "number" ||
    !Number.isInteger(pid) ||
    pid <= 0 ||
    typeof claimedAt !== "string" ||
    workdir === undefined
  ) {
    return undefined
  }

  return { taskId, pid, claimedAt, workdir }
}

/** 印に書かれた作業先。**判別可能な合併型の分だけを読む**（余分な鍵は落とす）。 */
function toWorkdir(value: unknown): Workdir | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }

  const path = value["path"]
  if (typeof path !== "string" || path === "") {
    return undefined
  }
  if (value["kind"] === "direct") {
    return { kind: "direct", path }
  }

  const branch = value["branch"]
  const origin = value["origin"]
  if (value["kind"] !== "worktree" || typeof branch !== "string" || typeof origin !== "string") {
    return undefined
  }
  return { kind: "worktree", path, branch, origin }
}

/** 壊れた JSON は undefined（外から来る値なので、読めないことを普通の結果として扱う）。 */
function parseJson(written: string): unknown {
  try {
    return JSON.parse(written) as unknown
  } catch {
    return undefined
  }
}
