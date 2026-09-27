// Beads（`bd`）を起こす口。タスクの一覧と成果の集計が両方使うので、`bd` を起こすのはここだけに
// 閉じ込める（検査の「子プロセスを起こしてよい箇所」の許可はこのファイル）。
// 起こすのは読むだけの `bd list` で、ネットワークにも出ない。
//
// `bd list --json` には作成者（owner）が入り、`--brief` を付けなければ本文も入る。どちらも
// 境界で落とし、`BeadsIssue` の欄だけを運ぶ（ログにも出さない）。
//
// 例外を投げない（常駐プロセスは1回の失敗で落ちない）。`.beads` が無い・`bd` が無いときも `failed`。

import { execFile } from "node:child_process"

import { z } from "zod"

import type { BeadsIssue } from "../../../shared/repository/beads-issue.ts"
import { GIT_TIMEOUT_MS, MAX_OUTPUT_BYTES } from "./git.ts"

/** `bd` 1回の結果。タイムアウトだけを分けるのは `GitOutcome` と同じ理由。 */
export type BeadsOutcome =
  | { readonly kind: "issues"; readonly issues: readonly BeadsIssue[] }
  | { readonly kind: "failed" }
  | { readonly kind: "timed-out" }

/**
 * 閉じたものも含めて全件を読む。`bd list` は `-n 0` を付けないと50件で打ち切る。
 * `cwd` はどの作業ツリーでもよい（`bd` が本体の作業ツリーの `.beads` を見つける）。
 */
export function readBeadsIssues(cwd: string): Promise<BeadsOutcome> {
  return new Promise((resolve) => {
    execFile(
      "bd",
      ["list", "--json", "--all", "-n", "0", "--brief", "--flat"],
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

/** 1件ぶんの形。読めない1件はその1件だけ読み飛ばす（ほかの課題まで「読めない」にしない）。 */
const beadsIssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  labels: z.array(z.string()).nullish(),
  dependencies: z.array(z.object({ depends_on_id: z.string(), type: z.string() })).nullish(),
  assignee: z.string().nullish(),
  created_at: z.iso.datetime({ offset: true }),
  closed_at: z.iso.datetime({ offset: true }).nullish(),
})

function beadsOutcomeOf(stdout: string): BeadsOutcome {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { kind: "failed" }
  }
  if (!Array.isArray(parsed)) {
    return { kind: "failed" }
  }

  const issues = parsed.flatMap((value: unknown) => {
    const issue = beadsIssueSchema.safeParse(value)
    return issue.success ? [beadsIssueOf(issue.data)] : []
  })
  return { kind: "issues", issues }
}

function beadsIssueOf(issue: z.infer<typeof beadsIssueSchema>): BeadsIssue {
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    labels: issue.labels ?? [],
    blockedBy: (issue.dependencies ?? [])
      .filter((dependency) => dependency.type === "blocks")
      .map((dependency) => dependency.depends_on_id),
    assignee: nonEmpty(issue.assignee),
    createdAtEpochMilliseconds: epochMillisecondsOf(issue.created_at),
    closedAtEpochMilliseconds:
      issue.closed_at === null || issue.closed_at === undefined
        ? undefined
        : epochMillisecondsOf(issue.closed_at),
  }
}

function nonEmpty(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : value
}

function epochMillisecondsOf(isoDateTime: string): number {
  return Temporal.Instant.from(isoDateTime).epochMilliseconds
}
