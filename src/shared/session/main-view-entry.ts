// セッションの記録を、メインビューに時系列で流す記録（`MainViewEntry`）へ変える。
// セッションの状態から導くだけで、別の状態は持たない。

import { changedFilesView } from "../report/changed-file-section.ts"
import { reportChecksView } from "../report/report-check-view.ts"
import { joinParts } from "../report/report-inline-markdown.ts"
import { phaseTimesView } from "../report/report-phase-time.ts"
import { isBlankText } from "../utils/blank-text.ts"
import { a2uiReportView } from "./a2ui-report-view.ts"
import type { MainViewEntry, MainViewReportRegions } from "./main-view-shape.ts"
import { finishedPhaseDuration, phaseDurations } from "./phase-duration.ts"
import { reportDrawnPieces } from "./report-drawn-markdown.ts"
import type { SessionRecord } from "./session-record.ts"
import type { SessionState } from "./session-state.ts"
import {
  advanceTurnContext,
  bashCommandDuration,
  EMPTY_TURN_CONTEXT,
  lastBashOf,
  latestWorkPlanOf,
  type TurnContext,
} from "./turn-context.ts"
import { phaseShiftOf } from "./work-plan-shift.ts"
import { advanceWorkPlanTrail } from "./work-plan-trail.ts"

/**
 * メインビューに渡す記録。
 * 書きかけの本文を末尾に足すので、描く部品はそのままリアルタイムの表示になる（完成した本文が来た時点で確定した記録の側へ移る）。
 * `tool` の記録も渡す（ステップの `actions` に入る）が、描く側はそこから描かない。
 */
export function mainViewEntries(state: SessionState): readonly MainViewEntry[] {
  const settled: MainViewEntry[] = []
  let context: TurnContext = EMPTY_TURN_CONTEXT
  for (const record of state.records) {
    settled.push(...entriesOf(record, context))
    context = advanceTurnContext(context, record)
  }
  return isBlankText(state.partialUtterance)
    ? settled
    : [...settled, { kind: "detail", markdown: state.partialUtterance }]
}

/** 記録1件の変換が頼る、前の記録から持ち回した値（記録の参照。無ければ `none`）。 */
type EntryDependency = SessionRecord | "none"

type RememberedEntries = {
  readonly dependencies: readonly EntryDependency[]
  readonly entries: readonly MainViewEntry[]
}

const ENTRIES_BY_RECORD = new WeakMap<SessionRecord, RememberedEntries>()

/** 記録1件の変換。記録も頼る値も変わっていなければ、前と同じ配列（同じ参照の要素）を返す。 */
function entriesOf(record: SessionRecord, context: TurnContext): readonly MainViewEntry[] {
  const dependencies = dependenciesOf(record, context)
  const remembered = ENTRIES_BY_RECORD.get(record)
  if (
    remembered !== undefined &&
    remembered.dependencies.length === dependencies.length &&
    remembered.dependencies.every((dependency, index) => dependency === dependencies[index])
  ) {
    return remembered.entries
  }
  const entries = toMainViewEntries(record, context)
  ENTRIES_BY_RECORD.set(record, { dependencies, entries })
  return entries
}

function dependenciesOf(record: SessionRecord, context: TurnContext): readonly EntryDependency[] {
  if (record.kind === "work-plan") {
    return [context.plan]
  }
  if (record.kind === "report") {
    return [
      ...record.checks.map((check) => lastBashOf(context, check.command)),
      ...context.trail.carried.flatMap((stretch) => stretch.plans),
      ...context.trail.plans,
    ]
  }
  return []
}

/**
 * `SessionRecord` 1件をメインビューに出す形へ変える（出さないものは空で返す）。
 *
 * `speech` は落とす（セリフは吹き出しだけに出し、レポートに混ぜない）。脇の話への答えのセリフだけは、脇の話の欄に出すので `aside-answer` にする。
 * ターンの通し番号は `request` の記録が持っているので、何を落としても番号はずれない。
 *
 * `compact-boundary` も落とす（圧縮の区切りは雑談のログだけに出す）。`reaction` も落とす（セリフのログだけに出す）。
 *
 * `work-plan` は、段が移ったときだけ `phase-shift` にする。
 *
 * `tool` は `toolUseId` / `nested`（突き合わせにしか使わない内部の付随情報）を落とす（メインビューの部品が見てよいのは名前・入力・結果だけ）。
 */
function toMainViewEntries(record: SessionRecord, context: TurnContext): readonly MainViewEntry[] {
  if (record.kind === "speech") {
    return record.answersAside ? [{ kind: "aside-answer", text: record.text }] : []
  }
  if (record.kind === "compact-boundary" || record.kind === "reaction") {
    return []
  }
  if (record.kind === "aside") {
    return [{ kind: "aside", text: record.text }]
  }
  if (record.kind === "work-plan") {
    const shift = phaseShiftOf(latestWorkPlanOf(context), record)
    if (shift.finished.kind === "none") {
      return []
    }
    const { label } = shift.finished
    const duration = finishedPhaseDuration(
      advanceWorkPlanTrail(context.trail, record),
      label,
      record.time,
    )
    return [{ kind: "phase-shift", shift, duration }]
  }
  // `request` は時刻（雑談のログだけが読む）を落として通す。仕事のメインビューには時刻を出さない。
  if (record.kind === "request") {
    return [{ kind: "request", turnId: record.turnId, text: record.text, images: record.images }]
  }
  if (record.kind === "report") {
    return [
      {
        kind: "report",
        toolUseId: record.toolUseId,
        regions: reportRegionsOf(record, context),
        conclusion: record.conclusion,
        task: record.task,
        changeSummary: record.changeSummary,
      },
    ]
  }
  // `detail` / `question` / `turn-failure` は `MainViewEntry` と同じ形なのでそのまま通す。
  if (record.kind !== "tool") {
    return [record]
  }
  return [{ kind: "tool", name: record.name, input: record.input, status: record.status }]
}

/**
 * `report` の引数を欄に組む。節は `components` から導く（`drawnReportOf`）。
 * 面（`a2ui`）には頭を結論・数の札・合図の行（`checks`）・段ごとの所要時間と変更したファイル（`status`・`finalStatus`）に分けた値と、お願い（`favor`）も載せる。
 * 図は見出しの無い先頭の節として描き、図の番号は本文の図と通しで振られる。図が無ければ何も描かない。
 * 段ごとの所要時間は最終のときの頭にだけ、同じ依頼のワークプランの記録（止めて再開した依頼の記録も引き継ぐ。{@link phaseDurations}）と `report` の `workPlanClosing` から描く。
 * `favor` の `id` は `favor-<toolUseId>` で、合図の行の総括行にある印がそこへ飛ぶ。
 * 中身の無い節は欄にしない。
 * `conclusion` は、`task` のあるレポートでは `conclusion`、無いレポートでは `conclusion-lead` の値になる（`task` そのものは本文に組まない）。
 *
 * 節の並びはここで整形する（`tidyReportOutline`。記録は引数のまま持ち、描くたびに導く）。
 */
function reportRegionsOf(
  report: Extract<SessionRecord, { readonly kind: "report" }>,
  context: TurnContext,
): MainViewReportRegions {
  const favorId = `favor-${report.toolUseId}`
  const leadKind = report.task.kind === "task" ? "conclusion" : "conclusion-lead"
  const checks = reportChecksView(
    report.checks,
    (command) => bashCommandDuration(context, command),
    isBlankText(report.favor) ? { kind: "none" } : { kind: "favor", id: favorId },
  )
  const phaseRows = phaseDurations(context.trail, report.time, report.workPlanClosing)
  const { drawn, layout, imageSource, pieces } = reportDrawnPieces(report)
  const sections = drawn.sections.filter((section) => section.role !== "retrospective")
  return {
    kind: "regions",
    sections: sections.flatMap((section, id) => {
      const piece = pieces[id]
      return piece === undefined || joinParts([piece.heading, ...piece.blocks]) === ""
        ? []
        : [{ id, heading: section.heading.trim() }]
    }),
    a2ui: a2uiReportView(
      report.components,
      drawn,
      pieces,
      layout,
      imageSource,
      {
        lead: isBlankText(report.conclusion)
          ? { kind: "none" }
          : { kind: leadKind, text: report.conclusion },
        keyFigures: report.keyFigures,
        checks,
        status: { phaseTimes: { kind: "none" }, changedFiles: { kind: "none" } },
        finalStatus: {
          phaseTimes: phaseTimesView(phaseRows),
          changedFiles: changedFilesView(report.changeSummary),
        },
      },
      { id: favorId, text: report.favor },
    ),
  }
}
