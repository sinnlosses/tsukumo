// 記録（`records`）に積むイベントのうち、畳み方の大きいものを畳んで次のセッションの姿を返す純粋関数。

import { NO_REPORT_CHANGE_SUMMARY } from "../report/report-change-summary.ts"
import { NO_REPORT_VERIFICATION } from "../report/report-verification.ts"
import type { SpeechEvent } from "./session-event-speech.ts"
import type { ReportCalledEvent, SessionEventOfKind, ToolStartedEvent } from "./session-event.ts"
import { workPlanRecords } from "./session-record-edit.ts"
import type { SessionState } from "./session-state.ts"
import { runsInBackground } from "./tool-record.ts"
import { settleReportDrafting, withOpenSdkTurn } from "./turn-progress-fold.ts"
import { answeringAsideOf } from "./turn-progress.ts"

export function advanceBySpeech(state: SessionState, event: SpeechEvent, at: number): SessionState {
  return {
    ...state,
    // 記録は積みっぱなし（`speeches` と違ってターンの境目で捨てない）。過去のターンの吹き出しと表情をここから引き直す。
    records: [
      ...state.records,
      {
        kind: "speech",
        text: event.text,
        expression: event.expression,
        time: { kind: "stamped", at },
        answersAside: answeringAsideOf(state.sdkTurn),
      },
    ],
    // 前のターンのセリフが残っているなら、ここで捨てて今のターンだけの並びにする。
    speeches: [
      ...(state.speechCalledInTurn || answeringAsideOf(state.sdkTurn) ? state.speeches : []),
      { text: event.text, expression: event.expression, time: { kind: "stamped", at } },
    ],
    speechExpression: event.expression,
    speechCalledInTurn: true,
  }
}

/**
 * `tool-started` と同じく、届いた位置に積むだけ（吹き出しにも帯の「いまの作業」にも出さない）。
 * フェーズの閉じ方が `finished` なら、閉じたワークプランの記録をその直前に積む。
 */
export function advanceByReport(
  state: SessionState,
  event: ReportCalledEvent,
  at: number,
): SessionState {
  return {
    ...withOpenSdkTurn(settleReportDrafting(state, event.toolUseId), (open) => ({
      ...open,
      bodies: { ...open.bodies, report: true },
    })),
    records: [
      ...state.records,
      ...workPlanRecords(state.records, event, at),
      {
        kind: "report",
        toolUseId: event.toolUseId,
        conclusion: event.conclusion,
        keyFigures: event.keyFigures,
        favor: event.favor,
        checks: event.checks,
        task: event.task,
        workPlanClosing: event.workPlanClosing,
        waitingLine: event.waitingLine,
        changeSummary: NO_REPORT_CHANGE_SUMMARY,
        verification: NO_REPORT_VERIFICATION,
        imageSizes: event.imageSizes,
        unshelvedImages: event.unshelvedImages,
        components: event.components,
        time: { kind: "stamped", at },
      },
    ],
  }
}

export function advanceByToolStarted(
  state: SessionState,
  event: ToolStartedEvent,
  at: number,
): SessionState {
  return {
    ...state,
    records: [
      ...state.records,
      {
        kind: "tool",
        toolUseId: event.toolUseId,
        name: event.name,
        input: event.input,
        nested: event.parentToolUseId !== undefined,
        startedAt: { kind: "stamped", at },
        status: { kind: "running" },
        backgroundEnd: runsInBackground(event.name, event.input)
          ? { kind: "awaiting" }
          : { kind: "foreground" },
      },
    ],
  }
}

/**
 * 答えが確定した1回だけ積む（未回答の質問は記録に残さない）。
 * 集計期間の切り詰めは要らない（質問はやり取りの境目にならないので、次の `request` が来たときに一緒に古いぶんが落ちる）。
 */
export function advanceByQuestionAnswered(
  state: SessionState,
  event: SessionEventOfKind<"question-answered">,
): SessionState {
  return {
    ...state,
    records: [
      ...state.records,
      {
        kind: "question",
        toolUseId: event.toolUseId,
        questions: event.questions,
        answers: event.answers,
        briefs: event.briefs,
        imageSizes: event.imageSizes,
        unshelvedImages: event.unshelvedImages,
      },
    ],
  }
}
