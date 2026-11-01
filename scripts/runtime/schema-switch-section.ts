// `report` の型の渡し方の切り替えの前後で、差し戻しの率・理由・出し直しの重さを並べた節。
// 読むのは時刻・セッションID・種類・理由の名前・字数だけで、会話の中身を持つ欄は読まない。

import { groupBy } from "remeda"
import { z } from "zod"

import { percentile } from "./argument-chars-section.ts"
import { isFakeSessionRow, rejectionSchema } from "./report-usage-row.ts"

const TOOL_ERROR = "tool-error"

const timedFields = { at: z.string(), sessionId: z.string() }

/** 受け付けの行は `kind` を持たない。 */
const acceptedSchema = z.object({ ...timedFields, kind: z.undefined().optional() })
const rejectedSchema = rejectionSchema.extend(timedFields)

type Rejected = z.infer<typeof rejectedSchema>
type Timed = { readonly at: string; readonly sessionId: string }

export type SchemaGroup = { readonly label: string; readonly rows: readonly unknown[] }

type Stats = {
  readonly label: string
  readonly accepted: readonly Timed[]
  readonly rejected: readonly Rejected[]
}

/** 前後の組を並べた表。各組の行は `reportSchema` などで呼び出し側が絞っておく。 */
export function schemaSwitchSection(groups: readonly SchemaGroup[]): string {
  const stats = groups.map(readStats)
  return [...stats.flatMap((entry) => [...summaryLines(entry), ""]), ...reasonLines(stats)].join(
    "\n",
  )
}

function readStats({ label, rows }: SchemaGroup): Stats {
  const real = rows.filter((raw) => !isFakeSessionRow(raw))
  return {
    label,
    accepted: real.flatMap((raw) => {
      const row = acceptedSchema.safeParse(raw)
      return row.success ? [row.data] : []
    }),
    rejected: real.flatMap((raw) => {
      const row = rejectedSchema.safeParse(raw)
      return row.success ? [row.data] : []
    }),
  }
}

function percent(count: number, total: number): string {
  return total === 0 ? "-" : `${((count / total) * 100).toFixed(1)}%`
}

function reasonsOf(row: Rejected): readonly string[] {
  return row.reasons
}

/** セッションごとに時刻順に見て、差し戻しが続いて受け付けで終わるまでの連なりの長さを返す。 */
function runLengths(stats: Stats): { readonly resolved: readonly number[]; readonly open: number } {
  const bySession = groupBy(
    [
      ...stats.accepted.map((row) => ({ ...row, isRejection: false })),
      ...stats.rejected.map((row) => ({ at: row.at, sessionId: row.sessionId, isRejection: true })),
    ],
    (row) => row.sessionId,
  )
  const resolved: number[] = []
  let open = 0
  for (const rows of Object.values(bySession)) {
    let run = 0
    for (const row of rows.toSorted((left, right) => left.at.localeCompare(right.at))) {
      if (row.isRejection) {
        run += 1
      } else {
        if (run > 0) {
          resolved.push(run)
        }
        run = 0
      }
    }
    open += run > 0 ? 1 : 0
  }
  return { resolved, open }
}

function distribution(lengths: readonly number[]): string {
  const counts = groupBy(lengths, String)
  return (
    Object.keys(counts)
      .toSorted((left, right) => Number(left) - Number(right))
      .map((length) => `${length}回 ${String(counts[length]?.length ?? 0)}連`)
      .join("、") || "なし"
  )
}

function ratio(numerator: number, denominator: number): string {
  return denominator === 0 ? "-" : (numerator / denominator).toFixed(2)
}

function summaryLines(stats: Stats): readonly string[] {
  const calls = stats.accepted.length + stats.rejected.length
  const nonToolError = stats.rejected.filter((row) => !reasonsOf(row).includes(TOOL_ERROR))
  const withNext = stats.rejected.filter((row) => row.nextCall !== undefined)
  const passedNext = withNext.filter((row) => row.nextCall?.reasons.length === 0)
  const rejectedMedian = percentile(
    stats.rejected.map((row) => row.argumentChars.total),
    0.5,
  )
  const nextMedian = percentile(
    withNext.map((row) => row.nextCall?.chars ?? 0),
    0.5,
  )
  const { resolved, open } = runLengths(stats)
  return [
    `${stats.label}:`,
    `  呼び出し ${String(calls)}（受け付け ${String(stats.accepted.length)}、差し戻し ${String(stats.rejected.length)}）`,
    `  差し戻しの率 ${percent(stats.rejected.length, calls)}（${TOOL_ERROR} を除くと ${String(nonToolError.length)}行 ${percent(nonToolError.length, calls)}）`,
    `  次の呼び出しで通った ${String(passedNext.length)}／${String(withNext.length)}行 ${percent(passedNext.length, withNext.length)}（次の記録が無い ${String(stats.rejected.length - withNext.length)}行は分母から外した）`,
    `  差し戻しの連なり（受け付けで終わった）: ${distribution(resolved)}、受け付けに届かず終わったセッション ${String(open)}`,
    `  字数の中央値 差し戻した呼び出し ${String(rejectedMedian)}、次の呼び出し ${String(nextMedian)}、比 ${ratio(nextMedian, rejectedMedian)}`,
  ]
}

function reasonLines(groups: readonly Stats[]): readonly string[] {
  const names = [...new Set(groups.flatMap((stats) => stats.rejected.flatMap(reasonsOf)))]
  const countOf = (stats: Stats, name: string): number =>
    stats.rejected.filter((row) => reasonsOf(row).includes(name)).length
  const rows = names
    .map((name) => ({ name, counts: groups.map((stats) => countOf(stats, name)) }))
    .toSorted((left, right) => Math.max(...right.counts) - Math.max(...left.counts))
  return [
    `差し戻しの理由 × 行数（${groups.map((stats) => `${stats.label}の差し戻し ${String(stats.rejected.length)}行`).join("、")}。1行に複数の理由がありうる）:`,
    ...rows.map(
      ({ name, counts }) =>
        `  ${name.padEnd(30)} ${groups
          .map(
            (stats, index) =>
              `${String(counts[index]).padStart(4)}件 ${percent(counts[index] ?? 0, stats.rejected.length).padStart(6)}`,
          )
          .join("  ")}`,
    ),
  ]
}
