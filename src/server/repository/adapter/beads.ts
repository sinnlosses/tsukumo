// Beads（`bd`）を起こす口。`bd` を起こすのはここだけ（検査の「子プロセスを起こしてよい箇所」の許可はこのファイル）。
// 起こすのは読むだけの `bd list` で、ネットワークにも出ない。
//
// `bd list --json` には作成者（owner）も入るが、境界で落とす（`BeadsIssue` の欄だけを運ぶ）。
// 本文（description・acceptance_criteria・notes）と `external_ref` はタスクのモーダルの詳細が使うので運ぶ（会話内容ではないが、ログには出さない）。
//
// 例外を投げない。`.beads` が無い・`bd` が無いときも `failed`。

import { execFile } from "node:child_process"
import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"

import { z } from "zod"

import type { BeadsIssue } from "../../../shared/repository/beads-issue.ts"
import { GIT_TIMEOUT_MS, MAX_OUTPUT_BYTES } from "./git.ts"

/** `bd` 1回の結果。タイムアウトだけを分けるのは、その回を諦めるか「不明」にするかが呼び出し側で変わるため。 */
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
      ["list", "--json", "--all", "-n", "0", "--flat"],
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

/**
 * 課題の変化の印（Dolt の `noms/manifest` の更新時刻）を読む関数を作る。`.beads` の場所は取れた1回だけ `bd where` で調べて覚える。
 * `bd` の内部の置き場に頼るので、取れないとき・形が違うときは必ず `undefined` を返し、呼ぶ側は毎回 `bd list` で読む。
 */
export function createBeadsStampReader(cwd: string): () => Promise<string | undefined> {
  let beadsDir: string | undefined = undefined

  return async () => {
    if (beadsDir === undefined) {
      const workspace = await readBeadsWorkspace(cwd)
      beadsDir = workspace.kind === "found" ? workspace.dir : undefined
    }
    return beadsDir === undefined ? undefined : readBeadsStampOf(beadsDir)
  }
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
 * `.beads` の課題の変化の印（Dolt の `noms/manifest` の更新時刻）。
 * `bd` の内部の置き場に頼るので、取れないとき・形が違うときは `undefined`。
 */
export async function readBeadsStampOf(beadsDir: string): Promise<string | undefined> {
  const databasesDir = join(beadsDir, "embeddeddolt")
  try {
    const entries = await readdir(databasesDir, { withFileTypes: true })
    const times = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const manifest = await stat(join(databasesDir, entry.name, ".dolt", "noms", "manifest"))
          return manifest.mtimeMs
        }),
    )
    return times.length === 0 ? undefined : times.join(",")
  } catch {
    return undefined
  }
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
  description: z.string().nullish(),
  acceptance_criteria: z.string().nullish(),
  notes: z.string().nullish(),
  external_ref: z.string().nullish(),
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
