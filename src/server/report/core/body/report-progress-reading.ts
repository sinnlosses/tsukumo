// `report` の引数の判定・次の手・置いた前提・出どころ・前回との対応・案内の付箋を読み、古い欄（`task.outcome`・`favor`・`workPlanClosing`）を同じ形へ読み替える。
// 読み替えはここだけに置き、描く側と検査は読み替えたあとの形だけを読む。
//
// 会話の内容がここを通る。ログにもファイルにも書かない。

import {
  REPORT_JUDGMENTS,
  type ReportGuideNote,
  type ReportJudgment,
  type ReportProgress,
  type ReportSourceEntry,
  reportGuideNoteSchema,
  reportNextSchema,
  reportPreviousSchema,
  reportSourceEntrySchema,
} from "../../../../shared/report/report-progress-field.ts"
import type { ReportTask } from "../../../../shared/report/report-task.ts"
import {
  closingOfJudgment,
  verdictClosingConflict,
  type WorkPlanClosing,
} from "../../../../shared/session/work-plan.ts"

/** 次の手の選べる答えのうち、描く数。 */
const MAX_NEXT_CHOICES = 3

/** {@link readProgressFields} に渡す、読み替えの元。`task`・`workPlanClosing` は読んだあとの値、ほかは引数の生の値。 */
export type ProgressFieldsInput = {
  readonly verdict: unknown
  readonly next: unknown
  readonly assumptions: unknown
  readonly sources: unknown
  readonly previous: unknown
  readonly guideNotes: unknown
  readonly favor: string
  readonly task: ReportTask
  readonly workPlanClosing: WorkPlanClosing
}

/**
 * 6つの欄を読み、古い欄を読み替える。形の崩れは「無い」に畳み、次の手の選べる答えは先頭3つに丸める。
 * 新しい欄があれば新しい欄が勝つ。判定は `verdict` → `task.outcome` → `done` の順に決まる。
 * 返す `workPlanClosing` は、書いたものがあればそれ、無ければ `verdict` を書いたときだけ判定から導き、どちらも無ければ `none`。
 */
export function readProgressFields(
  fields: ProgressFieldsInput,
): ReportProgress & { readonly workPlanClosing: WorkPlanClosing } {
  const written = REPORT_JUDGMENTS.find((judgment) => judgment === fields.verdict)
  const verdict = written ?? judgmentOfTask(fields.task)
  const workPlanClosing =
    fields.workPlanClosing !== "none" || written === undefined
      ? fields.workPlanClosing
      : closingOfJudgment(written)
  return {
    verdict,
    verdictWritten: written !== undefined,
    closingConflict:
      written !== undefined && verdictClosingConflict(written, fields.workPlanClosing),
    next: nextOf(fields.next, fields.favor),
    assumptions: stringsOf(fields.assumptions),
    sources: entriesOf(fields.sources, sourceOf),
    previous: previousOf(fields.previous),
    guideNotes: entriesOf(fields.guideNotes, guideNoteOf),
    workPlanClosing,
  }
}

function judgmentOfTask(task: ReportTask): ReportJudgment {
  if (task.kind === "none") {
    return "done"
  }
  switch (task.outcome) {
    case "finished":
      return "done"
    case "stopped":
      return "stopped"
    case "awaiting-answer":
      return "yours"
  }
}

function nextOf(value: unknown, favor: string): ReportProgress["next"] {
  const parsed = reportNextSchema.safeParse(value)
  if (parsed.success) {
    return {
      kind: "next",
      owner: parsed.data.owner,
      action: parsed.data.action,
      choices: (parsed.data.choices ?? []).slice(0, MAX_NEXT_CHOICES),
    }
  }
  return favor.trim() === ""
    ? { kind: "none" }
    : { kind: "next", owner: "you", action: favor, choices: [] }
}

function previousOf(value: unknown): ReportProgress["previous"] {
  const parsed = reportPreviousSchema.safeParse(value)
  return parsed.success ? { kind: "previous", ...parsed.data } : { kind: "none" }
}

function stringsOf(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []
}

/** 配列の要素ごとに `parse` を当て、読めた要素だけを残す。`parse` は読めなければ空の配列を返す。 */
function entriesOf<T>(value: unknown, parse: (item: unknown) => readonly T[]): readonly T[] {
  return Array.isArray(value) ? value.flatMap(parse) : []
}

function sourceOf(value: unknown): readonly ReportSourceEntry[] {
  const parsed = reportSourceEntrySchema.safeParse(value)
  return parsed.success ? [parsed.data] : []
}

function guideNoteOf(value: unknown): readonly ReportGuideNote[] {
  const parsed = reportGuideNoteSchema.safeParse(value)
  return parsed.success ? [parsed.data] : []
}
