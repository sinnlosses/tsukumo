// `report` の呼び出しの引数を、tsukumo 内部の `report` イベントに変換する。
// 引数は外部由来の値なので、unknown で受けて検証する。
//
// 会話の内容がここを通る。
// 持ち出す先は呼び出し側のイベントの流れだけで、ログにもファイルにも書かない。

import { isPlainObject } from "remeda"

import type { Expression } from "../../../shared/character-pack/expression.ts"
import { reportArgumentCharsOf } from "../../../shared/report/report-argument-size.ts"
import { parseKeyFigures } from "../../../shared/report/report-block-comparison.ts"
import { parseReportChecks } from "../../../shared/report/report-check.ts"
import { parseReportTask, type ReportTask } from "../../../shared/report/report-task.ts"
import type { SessionRemaining } from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { parseWorkPlanClosing } from "../../../shared/session/work-plan.ts"
import { optionalString } from "../../../shared/utils/optional-string.ts"
import { nonBlankString } from "../../core/non-blank-string.ts"
import { a2uiReportInput } from "./a2ui-report-message.ts"
import { parseConclusion } from "./conclusion-sentence.ts"
import { legacyReportComponents } from "./legacy-report-component-list.ts"
import { speechEvents } from "./sdk-speech-message.ts"

/**
 * `report` の引数を取り出す。
 * 本文の節・図・振り返りの塊は持たず、`components` の葉から導く。
 * `keyFigures` の「無い」と形の崩れ（3〜4個でない）は空の配列に畳む。
 * `favor` の「無い」は空の文字列に、`checks` の「無い」は空の配列に畳む（描く側は空の塊を置かないだけで済む）。
 * `task` の「無い」と形の崩れ（引数に `task` が無かったころの transcript も）は `none` に畳む。`workPlanClosing` も同じ。
 * `closing` の「無い」（引数に `closing` が無かったころの transcript）は `none` に畳む。
 * `waitingLine` の「無い」（省いた・文が空白だけ・形の崩れ）も `none` に畳む。
 * `title` の「無い」と文字列でないものは undefined。
 * `sessionSummary` の「無い」（空白だけも）は undefined。
 * `sessionRemaining` は空白だけなら `none`、文字列なら `remaining`、欄が無い・文字列でないなら `unrecorded` に畳む。
 * ただし作業を終えた（`task.outcome` が `finished`）呼び出しで欄が無いのは、省いたのと同じ残り無しの `none`。
 * `conclusion` は文字列の配列を連結し、文字列（引数が文字列だったころの transcript）は1要素として読む（{@link parseConclusion}）。
 * `conclusion` の「無い」は空の文字列に畳む（差し戻しのあとの出し直しで省いた欄は `ReportInheritance` が埋める）。
 * `conclusion` が文字列・文字列の配列・省略のどれでもなければ捨てる（引数の検査に落ちた呼び出しで、モデルには Claude Code がエラーを返す）。
 * `inheritedFields` はここでは空で、引き継ぎは `ReportInheritance` がする。
 * 空でない `components`（`a2ui` の版の部品の一覧）を持つ呼び出しは、一覧を旧い版の引数の形に組み直してから同じに取り出す（{@link a2uiReportInput}）。
 * そのときの `argumentChars` は、全体を生の引数で、欄ごとを組み直した引数で数える（引き継ぎが渡した欄を見分けられるように）。
 * 旧い変種の呼び出し（`sections`・`body`）は、先に `components` へ組み直してから同じに通す（{@link legacyReportComponents}）。
 * そのときの `argumentChars` は生の引数で数え、組み直せない引数（節が残らない）は組み直さずに取り出す。
 */
export function reportEvents(
  toolUseId: string,
  input: unknown,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  if (!isPlainObject(input)) {
    return []
  }
  const givenComponents: readonly unknown[] = Array.isArray(input.components)
    ? input.components
    : []
  const legacy = givenComponents.length > 0 ? undefined : legacyReportComponents(input)
  const a2ui =
    givenComponents.length > 0
      ? a2uiReportInput(givenComponents)
      : legacy === undefined
        ? undefined
        : a2uiReportInput(legacy.components)
  const fields = a2ui?.input ?? input
  const conclusion = parseConclusion(fields.conclusion)
  if (conclusion === undefined) {
    return []
  }

  const task = parseReportTask(fields.task)

  return [
    {
      kind: "report",
      toolUseId,
      argumentChars:
        a2ui === undefined || legacy !== undefined
          ? reportArgumentCharsOf(input)
          : {
              total: reportArgumentCharsOf(input).total,
              fields: reportArgumentCharsOf(a2ui.input).fields,
            },
      inheritedFields: [],
      conclusion: conclusion.conclusion,
      conclusionSentenceChars: conclusion.conclusionSentenceChars,
      conclusionFirstSentence: conclusion.conclusionFirstSentence,
      keyFigures: parseKeyFigures(fields.keyFigures),
      favor: optionalString(fields.favor) ?? "",
      checks: parseReportChecks(fields.checks),
      task,
      workPlanClosing: parseWorkPlanClosing(fields.workPlanClosing),
      closing: speechEvents(fields.closing, expressions)[0] ?? { kind: "none" },
      waitingLine: speechEvents(fields.waitingLine, expressions).find(
        (speech) => speech.text.trim() !== "",
      ) ?? { kind: "none" },
      droppedCount: (a2ui?.droppedCount ?? 0) + (legacy?.unknownBlockCount ?? 0),
      brokenFenceCount: legacy?.brokenFenceCount ?? 0,
      title: optionalString(fields.title),
      sessionSummary: nonBlankString(fields.sessionSummary),
      sessionRemaining: sessionRemainingOf(fields.sessionRemaining, task),
      components: a2ui?.components ?? [],
      imageSizes: [],
      unshelvedImages: [],
    },
  ]
}

function sessionRemainingOf(value: unknown, task: ReportTask): SessionRemaining {
  if (typeof value !== "string") {
    const finished = task.kind === "task" && task.outcome === "finished"
    return finished ? { kind: "none" } : { kind: "unrecorded" }
  }
  return value.trim() === "" ? { kind: "none" } : { kind: "remaining", text: value }
}
