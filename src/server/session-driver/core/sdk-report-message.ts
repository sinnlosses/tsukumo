// `report` の呼び出しの引数を、tsukumo 内部の `report` イベントに変換する。
// 引数は外部由来の値なので、unknown で受けて検証する。
//
// 会話の内容がここを通る。
// 持ち出す先は呼び出し側のイベントの流れだけで、ログにもファイルにも書かない。

import { isPlainObject } from "remeda"

import type { Expression } from "../../../shared/character-pack/expression.ts"
import { reportArgumentCharsOf } from "../../../shared/report/report-argument-chars.ts"
import {
  parseReportFigure,
  parseReportSections,
  reportSectionsOfBody,
} from "../../../shared/report/report-block.ts"
import { parseReportChecks } from "../../../shared/report/report-check.ts"
import { parseReportRetrospective } from "../../../shared/report/report-retrospective.ts"
import { parseReportTask } from "../../../shared/report/report-task.ts"
import type { SessionRemaining } from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { parseWorkPlanClosing } from "../../../shared/session/work-plan.ts"
import { nonBlankString } from "../../../shared/utils/non-blank-string.ts"
import { optionalString } from "../../../shared/utils/optional-string.ts"
import { speechEvents } from "./sdk-speech-message.ts"

/**
 * `report` の引数を取り出す。
 * `sections` は塊ごとに検証して崩れた塊・知らない種類の塊を落とす（{@link parseReportSections}）。
 * `sections` の無い呼び出し（引数が文字列の `body` だったころの transcript）は、`body` を逃げ道の塊1つの節に畳む（{@link reportSectionsOfBody}）。
 * `figure` の「無い」（引数に `figure` が無かったころの transcript）と形の崩れは、理由が `unrecorded` の `none` に畳む（{@link parseReportFigure}）。
 * `retrospective` の「無い」と形の崩れは `none` に畳む。
 * `favor` の「無い」は空の文字列に、`checks` の「無い」は空の配列に畳む（描く側は空の塊を置かないだけで済む）。
 * `task` の「無い」と形の崩れ（引数に `task` が無かったころの transcript も）は `none` に畳む。`workPlanClosing` も同じ。
 * `closing` の「無い」（引数に `closing` が無かったころの transcript）は `none` に畳む。
 * `waitingLine` の「無い」（省いた・文が空白だけ・形の崩れ）も `none` に畳む。
 * `sessionSummary` の「無い」（空白だけも）は undefined。
 * `sessionRemaining` は空白だけなら `none`、文字列なら `remaining`、欄が無い（欄の無かった頃の transcript）・文字列でないなら `unrecorded` に畳む。
 * `conclusion` が文字列でなければ捨てる（引数の検査に落ちた呼び出しで、モデルには Claude Code がエラーを返す）。
 */
export function reportEvents(
  toolUseId: string,
  input: unknown,
  expressions: readonly Expression[],
): readonly SessionEvent[] {
  if (!isPlainObject(input) || typeof input.conclusion !== "string") {
    return []
  }

  const parsed =
    input.sections === undefined
      ? { sections: reportSectionsOfBody(optionalString(input.body) ?? ""), unknownBlockCount: 0 }
      : parseReportSections(input.sections)

  return [
    {
      kind: "report",
      toolUseId,
      argumentChars: reportArgumentCharsOf(input),
      conclusion: input.conclusion,
      figure: parseReportFigure(input.figure),
      sections: parsed.sections,
      favor: optionalString(input.favor) ?? "",
      retrospective: parseReportRetrospective(input.retrospective),
      checks: parseReportChecks(input.checks),
      task: parseReportTask(input.task),
      workPlanClosing: parseWorkPlanClosing(input.workPlanClosing),
      closing: speechEvents(input.closing, expressions)[0] ?? { kind: "none" },
      waitingLine: speechEvents(input.waitingLine, expressions).find(
        (speech) => speech.text.trim() !== "",
      ) ?? { kind: "none" },
      unknownBlockCount: parsed.unknownBlockCount,
      sessionSummary: nonBlankString(input.sessionSummary),
      sessionRemaining: sessionRemainingOf(input.sessionRemaining),
    },
  ]
}

function sessionRemainingOf(value: unknown): SessionRemaining {
  if (typeof value !== "string") {
    return { kind: "unrecorded" }
  }
  return value.trim() === "" ? { kind: "none" } : { kind: "remaining", text: value }
}
