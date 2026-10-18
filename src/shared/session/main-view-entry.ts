// セッションの記録を、メインビューに時系列で流す記録（`MainViewEntry`）へ変える。
// セッションの状態から導くだけで、別の状態は持たない。

import { sectionsWithFigure } from "../report/report-block.ts"
import { reportChecksMarkdown } from "../report/report-check.ts"
import {
  htmlAttribute,
  reportSectionsMarkdown,
  SECTIONS_START_MARKDOWN,
} from "../report/report-markdown.ts"
import { phaseTimesMarkdown } from "../report/report-phase-time.ts"
import { retrospectiveMarkdown } from "../report/report-retrospective.ts"
import { tidyReportSections } from "../report/report-tidy.ts"
import { isBlankText } from "../utils/blank-text.ts"
import type { MainViewEntry } from "./main-view-shape.ts"
import { finishedPhaseDuration, phaseDurations } from "./phase-duration.ts"
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
import { phaseShiftOf } from "./work-plan.ts"

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
    return [...record.checks.map((check) => lastBashOf(context, check.command)), ...context.plans]
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
    const duration = finishedPhaseDuration([...context.plans, record], label, record.time)
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
        headings: reportSectionsOf(record, context)
          .map((section) => section.heading.trim())
          .filter((heading) => heading !== ""),
        markdown: reportMarkdown(record, context, false),
        finalMarkdown: reportMarkdown(record, context, true),
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
 * `report` の引数を、`conclusion` → 合図の行と段ごとの所要時間 → 節の始まりの印 → `figure` の図 → `sections` → `favor` の順に1つの本文へ組む。
 * 印は結論か合図の行か段ごとの所要時間があり、図か節が1つ以上あるときだけ置く。
 * `figure` の図は見出しの無い先頭の節として描き（`sectionsWithFigure`）、図の番号は `sections` の図と通しで振られる。`none` は何も描かない。
 * 合図の行と段ごとの所要時間は {@link statusMarkdown}。段ごとの所要時間は `withPhaseTimes` のときだけ、同じ依頼のワークプランから描く。
 * `favor` はレポートの記法の「お願い」の塊で包むので、サニタイズも記法の解釈もテキストの本文と同じ経路を通る。
 * `favor` は HTML の中に Markdown を入れるので、塊の内側の前後に空行を空ける。
 * 空の `sections` / `favor` と、欄の無い `retrospective` は塊ごと置かない。
 * `retrospective` の塊は `sections` の後ろ・`favor` の前に置く（{@link retrospectiveMarkdown}）。
 * `favor` の塊は `favor-<toolUseId>` の `id` を持ち、合図の行の総括行にある印がそこへ飛ぶ。
 * `conclusion` は、`task` のあるレポートでは見出しの下の一文として `conclusion` の印で、無いレポートでは見出しの代わりとして `conclusion-lead` の印で包む（`task` そのものは本文に組まない）。
 *
 * 節の並びはここで整形する（{@link tidyReportSections}。記録は引数のまま持ち、描くたびに導く）。
 */
function reportMarkdown(
  report: Extract<SessionRecord, { readonly kind: "report" }>,
  context: TurnContext,
  withPhaseTimes: boolean,
): string {
  const favorId = `favor-${report.toolUseId}`
  const head = [
    isBlankText(report.conclusion)
      ? ""
      : `<div class="${report.task.kind === "task" ? "conclusion" : "conclusion-lead"}">\n\n${report.conclusion}\n\n</div>`,
    statusMarkdown(
      reportChecksMarkdown(
        report.checks,
        (command) => bashCommandDuration(context, command),
        isBlankText(report.favor) ? { kind: "none" } : { kind: "favor", id: favorId },
      ),
      withPhaseTimes ? phaseTimesMarkdown(phaseDurations(context.plans, report.time)) : "",
    ),
  ].filter((part) => !isBlankText(part))
  const sections = reportSectionsMarkdown(reportSectionsOf(report, context), {
    kind: "shelved",
    toolUseId: report.toolUseId,
  })
  return [
    ...head,
    head.length > 0 && !isBlankText(sections) ? SECTIONS_START_MARKDOWN : "",
    sections,
    retrospectiveMarkdown(report.retrospective),
    isBlankText(report.favor)
      ? ""
      : `<div class="note note-favor" id="${htmlAttribute(favorId)}">\n\n${report.favor}\n\n</div>`,
  ]
    .filter((part) => !isBlankText(part))
    .join("\n\n")
}

/** 本文に描く節。`figure` を先頭の節にし、整形（{@link tidyReportSections}）したあとの並び。 */
function reportSectionsOf(
  report: Extract<SessionRecord, { readonly kind: "report" }>,
  context: TurnContext,
) {
  const tidied = tidyReportSections({
    conclusion: report.conclusion,
    sections: report.sections,
    hasWorkPlan: latestWorkPlanOf(context).kind === "planned",
  })
  return sectionsWithFigure(report.figure, tidied)
}

/**
 * 結論のすぐ下の合図の行（検証結果の判定）と、その下の段ごとの所要時間の帯と一覧を、結論と本文のあいだの1つのまとまりに包む。
 * どちらも空なら包みごと置かない。お願いの本文は末尾のまま動かさない。
 */
function statusMarkdown(checks: string, phaseTimes: string): string {
  const verdict = isBlankText(checks)
    ? ""
    : `<div class="verdict" role="group" aria-label="検証結果">${checks}</div>`
  const inner = [verdict, phaseTimes].filter((part) => !isBlankText(part)).join("\n\n")
  return inner === "" ? "" : `<div class="status">\n\n${inner}\n\n</div>`
}
