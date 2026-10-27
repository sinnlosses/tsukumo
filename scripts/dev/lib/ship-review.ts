// タスクに紐付かない送り出しの前に、受け入れ役の判定を通す門という概念を持つ。
// git・claude は呼ばず、呼び出し元が渡す `ShipReviewDeps` だけを呼ぶ。印はファイル1つずつで、置き場は呼び出し元が決める。

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

import { structuredOutputSchema } from "../../../src/server/core/structured-output-schema.ts"

const REVIEWED_PATH_PREFIXES = ["src/", "scripts/", "test/"] as const satisfies readonly string[]
const ACCEPTED_DIRECTORY = "accepted"
const REJECTED_DIRECTORY = "rejected"
const ACCEPTED_MARK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const MAX_REJECTIONS = 1

const acceptorVerdictSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  findings: z.array(z.string()),
})

/** 受け入れ役の構造化出力の形。`claude --json-schema` に渡す。 */
export const ACCEPTOR_VERDICT_JSON_SCHEMA = JSON.stringify(
  structuredOutputSchema(acceptorVerdictSchema),
)

export type ShipReviewOutcome =
  | { readonly kind: "skipped" }
  | { readonly kind: "passed" }
  | { readonly kind: "rejected"; readonly findings: readonly string[] }
  | { readonly kind: "exhausted"; readonly findings: readonly string[] }
  | { readonly kind: "unavailable"; readonly reason: string }

export type ShipReviewMarks = {
  readonly hasAccepted: (diffPatchId: string) => boolean
  readonly markAccepted: (diffPatchId: string) => void
  readonly readRejections: (firstCommitPatchId: string) => number
  readonly markRejected: (firstCommitPatchId: string, count: number) => void
}

export type ShipReviewDeps = {
  readonly changedPaths: () => readonly string[]
  readonly diffPatchId: () => string
  readonly firstCommitPatchId: () => string
  readonly marks: ShipReviewMarks
  /** 受け入れ役の構造化出力（形は未検証）。起こせない・返らないときは例外を投げる。 */
  readonly runAcceptor: () => unknown
}

export type AcceptorCriteria =
  | { readonly kind: "file"; readonly text: string }
  | { readonly kind: "subjects"; readonly subjects: readonly string[] }

type AcceptorVerdict =
  | { readonly kind: "pass"; readonly findings: readonly string[] }
  | { readonly kind: "fail"; readonly findings: readonly string[] }
  | { readonly kind: "unreadable" }

export type AgentDefinition = {
  readonly description: string
  readonly prompt: string
  readonly model: string
  readonly disallowedTools: readonly string[]
}

/** 差分のパスと印から、受け入れ役を起こすかを決め、判定を印に残す。 */
export function reviewDiff(deps: ShipReviewDeps): ShipReviewOutcome {
  if (!needsReview(deps.changedPaths())) {
    return { kind: "skipped" }
  }
  const diffPatchId = deps.diffPatchId()
  if (deps.marks.hasAccepted(diffPatchId)) {
    return { kind: "passed" }
  }

  let verdict: AcceptorVerdict
  try {
    verdict = readVerdict(deps.runAcceptor())
  } catch (error) {
    return { kind: "unavailable", reason: error instanceof Error ? error.message : String(error) }
  }

  switch (verdict.kind) {
    case "unreadable":
      return { kind: "unavailable", reason: "受け入れ役の構造化出力が判定の形でない" }
    case "pass":
      deps.marks.markAccepted(diffPatchId)
      return { kind: "passed" }
    case "fail": {
      const firstCommitPatchId = deps.firstCommitPatchId()
      const rejections = deps.marks.readRejections(firstCommitPatchId)
      deps.marks.markRejected(firstCommitPatchId, rejections + 1)
      return rejections >= MAX_REJECTIONS
        ? { kind: "exhausted", findings: verdict.findings }
        : { kind: "rejected", findings: verdict.findings }
    }
  }
}

/** エージェント定義のファイル（前書きと本文）を、`claude --agents` に渡す形にする。欄が欠けたら例外を投げる。 */
export function parseAgentDefinition(markdown: string): Record<string, AgentDefinition> {
  const matched = /^---\n(?<head>[\s\S]*?)\n---\n(?<body>[\s\S]*)$/.exec(markdown)
  const head = matched?.groups?.["head"]
  const body = matched?.groups?.["body"]
  if (head === undefined || body === undefined) {
    throw new Error("エージェント定義に前書きが無い")
  }
  const fields = new Map<string, string>()
  for (const line of head.split("\n")) {
    const field = /^(?<key>\w+):\s*(?<value>.*)$/.exec(line)?.groups
    if (field?.["key"] !== undefined && field["value"] !== undefined) {
      fields.set(field["key"], unquote(field["value"]))
    }
  }
  const name = requireField(fields, "name")
  return {
    [name]: {
      description: requireField(fields, "description"),
      prompt: body.trim(),
      model: requireField(fields, "model"),
      disallowedTools: requireField(fields, "disallowedTools")
        .split(",")
        .map((tool) => tool.trim())
        .filter((tool) => tool !== ""),
    },
  }
}

/** 受け入れ役への依頼文。差分は受け入れ役が `git` で読む。 */
export function buildAcceptorPrompt(base: string, criteria: AcceptorCriteria): string {
  const criteriaLines =
    criteria.kind === "file"
      ? ["完了条件（送る人が渡したもの）:", criteria.text.trim()]
      : [
          "完了条件は渡されていない。次のコミットの件名が言うことを差分が満たしているかで判定する:",
          ...criteria.subjects.map((subject) => `- ${subject}`),
        ]
  return [
    "タスクに紐付かない作業を main へ送る前の受け入れの判定を頼む。",
    `差分は \`git diff ${base}..HEAD\`、コミットは \`git log ${base}..HEAD\` で読む。`,
    "`vendor/tsukumo-plugins/skills/task-workflow/review-criteria.md` の観点と、`.claude/rules/` の規約で点検する。",
    "`acceptor-brief.md` は `tw accept` 用なので読まない。ファイルを書き換えない。",
    "",
    ...criteriaLines,
    "",
    "返し方: 構造化出力の `verdict` に、通すなら `pass`、差し戻すなら `fail` を入れ、",
    "`findings` に直すべき指摘を1件1要素で `<ファイル>: <何が問題か>` と入れる。",
  ].join("\n")
}

/** `directory` の下に、通った差分と差し戻しの回数の印を置く。通った印は書くときに古いものを消す。 */
export function createShipReviewMarks(directory: string, nowMs: number): ShipReviewMarks {
  const acceptedDirectory = join(directory, ACCEPTED_DIRECTORY)
  const rejectedDirectory = join(directory, REJECTED_DIRECTORY)
  return {
    hasAccepted: (diffPatchId) => readMark(join(acceptedDirectory, diffPatchId)) !== undefined,
    markAccepted: (diffPatchId) => {
      mkdirSync(acceptedDirectory, { recursive: true })
      pruneOldMarks(acceptedDirectory, nowMs)
      writeFileSync(join(acceptedDirectory, diffPatchId), "")
    },
    readRejections: (firstCommitPatchId) => {
      const count = Number.parseInt(
        readMark(join(rejectedDirectory, firstCommitPatchId)) ?? "0",
        10,
      )
      return Number.isInteger(count) && count > 0 ? count : 0
    },
    markRejected: (firstCommitPatchId, count) => {
      mkdirSync(rejectedDirectory, { recursive: true })
      writeFileSync(join(rejectedDirectory, firstCommitPatchId), String(count))
    },
  }
}

function needsReview(paths: readonly string[]): boolean {
  return paths.some((path) => REVIEWED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)))
}

function readVerdict(output: unknown): AcceptorVerdict {
  const parsed = acceptorVerdictSchema.safeParse(output)
  if (!parsed.success) {
    return { kind: "unreadable" }
  }
  return { kind: parsed.data.verdict, findings: parsed.data.findings }
}

function readMark(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

function pruneOldMarks(directory: string, nowMs: number): void {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (nowMs - statSync(path).mtimeMs > ACCEPTED_MARK_LIFETIME_MS) {
      rmSync(path, { force: true })
    }
  }
}

function requireField(fields: ReadonlyMap<string, string>, key: string): string {
  const value = fields.get(key)
  if (value === undefined || value === "") {
    throw new Error(`エージェント定義の前書きに ${key} が無い`)
  }
  return value
}

function unquote(value: string): string {
  const trimmed = value.trim()
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed
}
