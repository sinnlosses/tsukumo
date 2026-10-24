// Beads（`bd`）を起こす口。`bd` を起こすのはここだけ（検査の「子プロセスを起こしてよい箇所」の許可はこのファイル）。
// 起こすのは読むだけの `bd list`・`bd where`・`bd vc status` で、ネットワークにも出ない。
//
// `bd list --json` には作成者（owner）なども入るが、境界で落とす（`BeadsIssue` の欄だけを運ぶ）。
// 本文（description・acceptance_criteria・notes）と `external_ref` はタスクのモーダルの詳細が使うので運ぶ（会話内容ではないが、ログには出さない）。
// 本文を読むのはタスク板が出す課題だけ（全件の本文は出力の上限 `MAX_OUTPUT_BYTES` に届く大きさになる）。
//
// 例外を投げない。`.beads` が無い・`bd` が無いときも `failed`。

import { execFile } from "node:child_process"

import { z } from "zod"

import {
  TASK_DIFFICULTIES,
  TASK_LOOPABLES,
  type TaskDifficulty,
  type TaskLoopable,
} from "../../../shared/repository/task-summary.ts"
import { GIT_TIMEOUT_MS, MAX_OUTPUT_BYTES } from "./git.ts"

/**
 * `bd list --json` の1件のうち、Beads の組み込みの欄でこの読み手が使うものだけ。
 * `closedAtEpochMilliseconds`・`externalRef` は Beads の側で無ければ `undefined`、`labels` は無ければ空、本文の3欄は無ければ空文字列。
 * 閉じた課題は閉じた時刻の新しい {@link CLOSED_TASK_DISPLAY_LIMIT} 件だけ本文を付け、ほかは本文の3欄が空文字列。
 */
export type BeadsIssue = {
  readonly id: string
  readonly title: string
  readonly status: string
  /** `blocks` の依存先の Beads ID。 */
  readonly blockedBy: readonly string[]
  readonly labels: readonly string[]
  /** metadata の `difficulty`。無い・表に無い値は `undefined`。 */
  readonly difficulty: TaskDifficulty | undefined
  /** metadata の `loopable`。無い・表に無い値は `undefined`。 */
  readonly loopable: TaskLoopable | undefined
  /** metadata の `draft` が `"Y"`（エージェントが積んだドラフトの印）。それ以外・無いときは偽。 */
  readonly draft: boolean
  readonly createdAtEpochMilliseconds: number
  readonly closedAtEpochMilliseconds: number | undefined
  readonly description: string
  readonly acceptanceCriteria: string
  readonly notes: string
  readonly externalRef: string | undefined
}

/** `bd` 1回の結果。タイムアウトだけを分けるのは、その回を諦めるか「不明」にするかが呼び出し側で変わるため。 */
export type BeadsOutcome =
  | { readonly kind: "issues"; readonly issues: readonly BeadsIssue[] }
  | { readonly kind: "failed" }
  | { readonly kind: "timed-out" }

/** タスク板に残す、閉じた課題の件数。 */
export const CLOSED_TASK_DISPLAY_LIMIT = 10

/** 印が動かなくても読み直す間隔。印が書き込みを取りこぼしたときに結果が古いまま残る長さの上限になる。 */
export const BEADS_REREAD_INTERVAL_MS = 60_000

/** 時計が戻ったとき（負の経過）も間隔の外として読み直す。 */
export function isWithinRereadInterval(elapsedMs: number): boolean {
  return elapsedMs >= 0 && elapsedMs < BEADS_REREAD_INTERVAL_MS
}

/** `cwd` の課題を読む。`stamp` は呼ぶ側が先に読んだ課題の変化の印で、取れないときは `undefined`。 */
export type BeadsIssuesReader = (cwd: string, stamp: string | undefined) => Promise<BeadsOutcome>

/**
 * `read` を、同じ `cwd` に同じ `stamp` が続く間は読み直さない形にする。
 * 同時に来た読みにも同じ結果を渡す。`stamp` が `undefined` のときと、読めなかった（`issues` でない）ときは覚えない。
 */
export function memoizeByStamp(read: (cwd: string) => Promise<BeadsOutcome>): BeadsIssuesReader {
  const remembered = new Map<
    string,
    { readonly stamp: string; readonly outcome: Promise<BeadsOutcome> }
  >()

  return (cwd, stamp) => {
    if (stamp === undefined) {
      remembered.delete(cwd)
      return read(cwd)
    }
    const previous = remembered.get(cwd)
    if (previous?.stamp === stamp) {
      return previous.outcome
    }
    const entry = { stamp, outcome: read(cwd) }
    remembered.set(cwd, entry)
    const forgetUnless = (outcome: BeadsOutcome | undefined): void => {
      if (outcome?.kind !== "issues" && remembered.get(cwd) === entry) {
        remembered.delete(cwd)
      }
    }
    entry.outcome.then(forgetUnless, () => {
      forgetUnless(undefined)
    })
    return entry.outcome
  }
}

/**
 * 閉じたものも含めて全件を読む。
 * 一覧と成果が同じ印で続けて読むときは、読みを1回で済ませる。
 * `cwd` はどの作業ツリーでもよい（`bd` が本体の作業ツリーの `.beads` を見つける）。
 */
export const readBeadsIssues: BeadsIssuesReader = memoizeByStamp(listAllBeadsIssues)

/** `.beads` が見つからなければ `missing`。あれば課題の変化の印（取れないときは `undefined`）。 */
export type BeadsStamp =
  | { readonly kind: "missing" }
  | { readonly kind: "present"; readonly stamp: string | undefined }

/**
 * `.beads` の有無と課題の変化の印（{@link readBeadsStampOf}）を読む関数を作る。
 * `.beads` の場所は取れた1回だけ `bd where` で調べて覚え、見つからないうちは読むたびに調べ直す。
 * `bd where` がタイムアウトしたときは `.beads` があるものとして印を `undefined` にする。
 * 読みの最中に呼ばれたら新しく起こさず、実行中の読みの結果を渡す（一覧と成果が1つの読み手を共有する）。
 */
export function createBeadsStampReader(
  cwd: string,
  readers: BeadsStampReaders = { readWorkspace: readBeadsWorkspace, readStamp: readBeadsStampOf },
): () => Promise<BeadsStamp> {
  let beadsFound = false
  let running: Promise<BeadsStamp> | undefined = undefined

  const readOnce = async (): Promise<BeadsStamp> => {
    if (!beadsFound) {
      const workspace = await readers.readWorkspace(cwd)
      if (workspace.kind === "missing") {
        return { kind: "missing" }
      }
      if (workspace.kind === "timed-out") {
        return { kind: "present", stamp: undefined }
      }
      beadsFound = true
    }
    return { kind: "present", stamp: await readers.readStamp(cwd) }
  }

  return () => {
    if (running === undefined) {
      const current = readOnce().finally(() => {
        running = undefined
      })
      running = current
    }
    return running
  }
}

/** {@link createBeadsStampReader} が `bd` を起こす2つの口。 */
export type BeadsStampReaders = {
  readonly readWorkspace: (cwd: string) => Promise<BeadsWorkspace>
  readonly readStamp: (cwd: string) => Promise<string | undefined>
}

/** `bd where` の結果。`missing` は `.beads` が見つからない・`bd` が無い。 */
export type BeadsWorkspace =
  | { readonly kind: "found"; readonly dir: string }
  | { readonly kind: "missing" }
  | { readonly kind: "timed-out" }

/** `cwd` から `bd` が使う `.beads` の場所を `bd where` で調べる。 */
export function readBeadsWorkspace(cwd: string): Promise<BeadsWorkspace> {
  return new Promise((resolve) => {
    execFile(
      "bd",
      ["where"],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout) => {
        if (error !== null) {
          resolve({ kind: error.killed === true ? "timed-out" : "missing" })
          return
        }
        const firstLine = stdout.split("\n")[0]?.trim()
        resolve(
          firstLine === undefined || firstLine === ""
            ? { kind: "missing" }
            : { kind: "found", dir: firstLine },
        )
      },
    )
  })
}

/**
 * `cwd` の課題の変化の印（`bd vc status --json` の `commit`。Beads の Dolt の HEAD）。
 * bd 1.3.1 では課題の作成・更新・ラベル・コメント・依存・クローズのどれでも変わり、読むだけでは変わらない。
 * `bd` が無い・落ちた・時間切れ・形が違うときは `undefined`。
 */
export function readBeadsStampOf(cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "bd",
      ["vc", "status", "--json"],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout) => {
        resolve(error === null ? beadsStampOfVcStatus(stdout) : undefined)
      },
    )
  })
}

/** 1件ぶんの形。読めない1件はその1件だけ読み飛ばす（ほかの課題まで「読めない」にしない）。 */
const beadsIssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  dependencies: z.array(z.object({ depends_on_id: z.string(), type: z.string() })).nullish(),
  labels: z.array(z.string()).nullish(),
  metadata: z.unknown().optional(),
  created_at: z.iso.datetime({ offset: true }),
  closed_at: z.iso.datetime({ offset: true }).nullish(),
  description: z.string().nullish(),
  acceptance_criteria: z.string().nullish(),
  notes: z.string().nullish(),
  external_ref: z.string().nullish(),
})

/** `bd list --json` の出力（課題の配列）を読み替える。配列でない・JSON でないときは `failed`。 */
export function beadsOutcomeOf(stdout: string): BeadsOutcome {
  const parsed = parsedJsonOf(stdout)
  if (!Array.isArray(parsed)) {
    return { kind: "failed" }
  }

  const issues = parsed.flatMap((value: unknown) => {
    const issue = beadsIssueSchema.safeParse(value)
    return issue.success ? [beadsIssueOf(issue.data)] : []
  })
  return { kind: "issues", issues }
}

const vcStatusSchema = z.object({ commit: z.string().min(1) })

/** `bd vc status --json` の出力から `commit` を取り出す。JSON でない・`commit` が無い・空なら `undefined`。 */
function beadsStampOfVcStatus(stdout: string): string | undefined {
  const status = vcStatusSchema.safeParse(parsedJsonOf(stdout))
  return status.success ? status.data.commit : undefined
}

/** JSON として読めなければ `undefined`（JSON の値に `undefined` は無いので、読めた値と混ざらない）。 */
function parsedJsonOf(stdout: string): unknown {
  try {
    return JSON.parse(stdout)
  } catch {
    return undefined
  }
}

// `bd list` は `-n 0` を付けないと50件で打ち切る。`--all` を付けないと閉じた課題を出さない。
const ALL_WITHOUT_BODY_ARGS = ["--all", "-n", "0", "--brief"] as const
const UNFINISHED_ARGS = ["-n", "0"] as const
const RECENT_CLOSED_ARGS = [
  "--status",
  "closed",
  "--sort",
  "closed",
  "-n",
  String(CLOSED_TASK_DISPLAY_LIMIT),
] as const

/**
 * 全件を本文なしで読み、本文は閉じていない課題と閉じた新しい課題の2本から id で付ける。
 * 本文つきの2本にしか無い課題（読みのあいだに足された課題）は出さない。
 */
async function listAllBeadsIssues(cwd: string): Promise<BeadsOutcome> {
  const [all, unfinished, recentClosed] = await Promise.all([
    listBeadsIssues(cwd, ALL_WITHOUT_BODY_ARGS),
    listBeadsIssues(cwd, UNFINISHED_ARGS),
    listBeadsIssues(cwd, RECENT_CLOSED_ARGS),
  ])
  if (all.kind !== "issues" || unfinished.kind !== "issues" || recentClosed.kind !== "issues") {
    return [all, unfinished, recentClosed].some((outcome) => outcome.kind === "failed")
      ? { kind: "failed" }
      : { kind: "timed-out" }
  }

  const withBody = new Map(
    [...unfinished.issues, ...recentClosed.issues].map((issue) => [issue.id, issue]),
  )
  return {
    kind: "issues",
    issues: all.issues.map((issue) => {
      const body = withBody.get(issue.id)
      return body === undefined
        ? issue
        : {
            ...issue,
            description: body.description,
            acceptanceCriteria: body.acceptanceCriteria,
            notes: body.notes,
          }
    }),
  }
}

function listBeadsIssues(cwd: string, args: readonly string[]): Promise<BeadsOutcome> {
  return new Promise((resolve) => {
    execFile(
      "bd",
      ["list", "--json", "--flat", ...args],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout) => {
        if (error === null) {
          resolve(beadsOutcomeOf(stdout))
        } else {
          resolve({ kind: error.killed === true ? "timed-out" : "failed" })
        }
      },
    )
  })
}

const metadataSchema = z.record(z.string(), z.unknown())
const difficultySchema = z.enum(TASK_DIFFICULTIES)
const loopableSchema = z.enum(TASK_LOOPABLES)
const DRAFT_MARK = "Y"

function beadsIssueOf(issue: z.infer<typeof beadsIssueSchema>): BeadsIssue {
  const metadata = metadataSchema.safeParse(issue.metadata)
  const difficulty = difficultySchema.safeParse(metadata.data?.["difficulty"])
  const loopable = loopableSchema.safeParse(metadata.data?.["loopable"])
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    blockedBy: (issue.dependencies ?? [])
      .filter((dependency) => dependency.type === "blocks")
      .map((dependency) => dependency.depends_on_id),
    labels: issue.labels ?? [],
    difficulty: difficulty.success ? difficulty.data : undefined,
    loopable: loopable.success ? loopable.data : undefined,
    draft: metadata.data?.["draft"] === DRAFT_MARK,
    createdAtEpochMilliseconds: epochMillisecondsOf(issue.created_at),
    closedAtEpochMilliseconds:
      issue.closed_at === null || issue.closed_at === undefined
        ? undefined
        : epochMillisecondsOf(issue.closed_at),
    description: issue.description ?? "",
    acceptanceCriteria: issue.acceptance_criteria ?? "",
    notes: issue.notes ?? "",
    externalRef: nonEmpty(issue.external_ref),
  }
}

function nonEmpty(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : value
}

function epochMillisecondsOf(isoDateTime: string): number {
  return Temporal.Instant.from(isoDateTime).epochMilliseconds
}
