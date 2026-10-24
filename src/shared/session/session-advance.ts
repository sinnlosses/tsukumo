// イベント1件を畳み込んで次のセッションの姿を返す純粋関数。
// 時刻は畳み込みの中で時計を読まず、イベントに打たれた `at`（エポックミリ秒）を受け取る（サーバとブラウザの状態が同じになるように、時刻はイベントの発生側が決める）。

import type { CharacterInfo } from "../character-pack/character.ts"
import { isModelAlias } from "../command.ts"
import { applyDiaryEvent } from "../diary/diary.ts"
import { NO_REPORT_CHANGE_SUMMARY } from "../report/report-change-summary.ts"
import { applyTaskSummaryChange } from "../repository/task-summary-change.ts"
import type { PendingAsk, StampedPendingAsk } from "../session-driver/pending-ask.ts"
import { applyUsageReviewEvent } from "../usage-review/usage-review.ts"
import { isBlankText } from "../utils/blank-text.ts"
import { clipText } from "../utils/clip-text.ts"
import { commandCandidates } from "./command-suggestion.ts"
import { isSessionEventKind } from "./session-event-kind.ts"
import type { SessionEvent } from "./session-event.ts"
import { permissionModeValue } from "./session-info.ts"
import {
  settleUtterance,
  trimToRecentTurns,
  withReportChangeSummary,
  workPlanRecords,
} from "./session-record-edit.ts"
import { MAX_TOOL_TEXT_LENGTH } from "./session-record.ts"
import type { SessionState } from "./session-state.ts"
import { originOf, withAcceptedMark, withConfirmedMark } from "./setting-mark.ts"
import { finishTool, notifyBackgroundEnd, runsInBackground } from "./tool-record.ts"
import {
  answeringAsideOf,
  beginAside,
  beginTurn,
  clearedSdkTurn,
  CLOSED_SDK_TURN,
  finishedTurnCountOf,
  finishTurn,
  INITIAL_SPEECH_EXPRESSION,
  recordTurnFailure,
  resumeTurn,
  settleReportDrafting,
  turnEnding,
  withOpenSdkTurn,
} from "./turn-progress.ts"

/**
 * モデルが何かを出したと言えるイベント。届いたら {@link SessionState.apiTrouble} を下ろす
 * （呼び直しが実った・API のエラーから立て直した合図は別に来ないため）。`step-usage` は
 * 思考だけのステップでも届くので、本文が出る前に「再試行中」を下ろせる。
 */
const MODEL_OUTPUT_EVENT_KINDS: ReadonlySet<SessionEvent["kind"]> = new Set([
  "partial-utterance",
  "utterance",
  "speech",
  "report-drafting",
  "report",
  "work-plan",
  "tool-started",
  "step-usage",
] satisfies SessionEvent["kind"][])

/**
 * イベント1件を畳み込んで次の姿を返す。知らない状況でも必ず姿を返す（落ちない）。
 * `at` はイベントが起きた時刻（`StampedEvent.at`）。時計をここで読まない（サーバとブラウザで同じ結果になるようにするため）。
 * 反応の記録（`reaction`）は積まない。積むのは `applySessionEvent`。
 */
export function advanceSessionState(
  state: SessionState,
  event: SessionEvent,
  at: number,
): SessionState {
  if (!isSessionEventKind(event.kind)) return state
  return foldSessionEvent(
    MODEL_OUTPUT_EVENT_KINDS.has(event.kind) ? { ...state, apiTrouble: { kind: "none" } } : state,
    event,
    at,
  )
}

/** {@link advanceSessionState} の本体（API の不調を下ろしたあとの姿に、イベント1件を畳む）。 */
function foldSessionEvent(state: SessionState, event: SessionEvent, at: number): SessionState {
  switch (event.kind) {
    case "session-info":
      return {
        ...state,
        session:
          event.permissionMode !== undefined
            ? { kind: "running", sessionId: event.sessionId, permissionMode: event.permissionMode }
            : { kind: "identified", sessionId: event.sessionId },
        // `model` は `session` とは独立に更新する（`SessionInfo` の doc コメント）。
        model: event.model,
        slashCommands: commandCandidates(event.slashCommands, event.terminalSlashCommands),
        skillNames: event.skillNames,
        agentNames: event.agentNames,
      }
    case "command-descriptions":
      return { ...state, commandDescriptions: event.descriptions }
    case "plan":
      return { ...state, plan: event.plan }
    case "model-changed":
      // `MODEL_ALIASES` に完全一致するときだけ先回りで更新する（`/model best` のような tsukumo が知らない値では状態を変えず、次の `init` を待つ）。
      // `session.kind` は見ない（`running` に絞ると、切り替えても数秒で古い値に戻って見える。`SessionInfo` の doc コメント）。
      return withAcceptedMark(
        isModelAlias(event.model) ? { ...state, model: event.model } : state,
        "model",
        event.model,
        originOf(state.model),
        at,
      )
    case "model-effort-support":
      return { ...state, modelEffortSupport: event.models }
    case "effort-changed":
      return withAcceptedMark(
        { ...state, effort: event.effort },
        "effort",
        event.effort,
        originOf(state.effort),
        at,
      )
    case "permission-mode-changed":
      // 許可モードは次の `init` まで `session` の値が変わらないので、切り替える前に効いていた値が残っている。
      return withAcceptedMark(
        state,
        "permissionMode",
        event.mode,
        originOf(
          state.session.kind === "running"
            ? permissionModeValue(state.session.permissionMode)
            : undefined,
        ),
        at,
      )
    case "setting-confirmed":
      return withConfirmedMark(
        event.setting === "effort" ? { ...state, effort: event.value } : state,
        event,
        at,
      )
    case "request":
      return {
        ...beginTurn(state, at),
        records: trimToRecentTurns(
          [
            ...state.records,
            {
              kind: "request",
              turnId: state.nextTurnId,
              text: event.text,
              images: event.images,
              time: { kind: "stamped", at },
            },
          ],
          state.chatMode,
        ),
      }
    case "aside":
      return {
        ...beginAside(state, at),
        records: [
          ...state.records,
          { kind: "aside", text: event.text, images: event.images, time: { kind: "stamped", at } },
        ],
      }
    case "turn-started":
      // 記録を持たないターンの始まり。積むものが無いだけで、吹き出し・表情・進行中の印は `request` と同じに動かす。
      return beginTurn(state, at)
    case "turn-resumed":
      return resumeTurn(state, at)
    case "partial-utterance":
      return { ...state, partialUtterance: state.partialUtterance + event.text }
    case "utterance":
      return settleUtterance({
        ...(isBlankText(event.text)
          ? state
          : withOpenSdkTurn(state, (open) => ({
              ...open,
              bodies: { ...open.bodies, utterance: true },
            }))),
        partialUtterance: event.text,
      })
    case "speech":
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
    // サーバの中で `speech` に変わってから届く（`CallReview`）。
    case "speak-called":
      return state
    // サーバの中で `work-plan` に変わってから届く（`CallReview`）。
    case "work-plan-called":
      return state
    // サーバの中で `CallReview` が受けて捨てる。
    case "phase-result-called":
    case "delegate-handed-back":
      return state
    case "delegate-returned":
      return { ...state, records: [...state.records, ...workPlanRecords(state.records, event, at)] }
    case "report-malformed":
    case "report-rejected":
      return state
    case "report-drafting":
      return withOpenSdkTurn(state, (open) => ({
        ...open,
        reportDrafting: { kind: "drafting", toolUseId: event.toolUseId },
      }))
    case "report":
      // `tool-started` と同じく、届いた位置に積むだけ（吹き出しにも帯の「いまの作業」にも出さない）。
      // 段の閉じ方が `finished` なら、閉じたワークプランの記録をその直前に積む。
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
            figure: event.figure,
            sections: event.sections,
            favor: event.favor,
            retrospective: event.retrospective,
            checks: event.checks,
            task: event.task,
            waitingLine: event.waitingLine,
            changeSummary: NO_REPORT_CHANGE_SUMMARY,
            time: { kind: "stamped", at },
          },
        ],
      }
    case "report-change-summary":
      return withReportChangeSummary(state, event)
    case "work-plan":
      return {
        ...state,
        records: [
          ...state.records,
          {
            kind: "work-plan",
            phases: event.phases,
            current: event.current,
            finishedInGroup: event.finishedInGroup,
            phaseSummary: event.phaseSummary,
            delegatedRange: event.delegatedRange,
            skippedPhases: event.skippedPhases,
            awaitingSummary: event.awaitingSummary,
            time: { kind: "stamped", at },
          },
        ],
      }
    case "tool-started": {
      const nested = event.parentToolUseId !== undefined
      return {
        ...state,
        records: [
          ...state.records,
          {
            kind: "tool",
            toolUseId: event.toolUseId,
            name: event.name,
            input: event.input,
            nested,
            startedAt: { kind: "stamped", at },
            status: { kind: "running" },
            backgroundEnd: runsInBackground(event.name, event.input)
              ? { kind: "awaiting" }
              : { kind: "foreground" },
          },
        ],
      }
    }
    case "background-tool-finished":
      return notifyBackgroundEnd(state, event.toolUseId, at)
    // 駆動が送り出す手前で捨てる。
    case "delegate-progress":
    case "progress-nudged":
      return state
    case "tool-finished":
      return finishTool(
        settleReportDrafting(state, event.toolUseId),
        event.toolUseId,
        event.isError
          ? { kind: "failed", output: clipText(event.content, MAX_TOOL_TEXT_LENGTH) }
          : { kind: "succeeded" },
        at,
      )
    case "pending-changed":
      return { ...state, pending: stampPending(state.pending, event.pending, at) }
    case "question-answered":
      // 答えが確定した1回だけ積む（未回答の質問は記録に残さない）。
      // 窓の切り詰めは要らない（質問はやり取りの境目にならないので、次の `request` が来たときに一緒に古いぶんが落ちる）。
      return {
        ...state,
        records: [
          ...state.records,
          {
            kind: "question",
            toolUseId: event.toolUseId,
            questions: event.questions,
            answers: event.answers,
          },
        ],
      }
    // 書きかけのまま終わったターン（中断など）の本文を捨てず、確定した記録に移す。
    case "turn-finished": {
      const ending = turnEnding(event.outcome, state.apiTrouble)
      // `diaryWriting` と見直しの欄はここでは動かさない（どちらも会話とは別の使い捨ての問い合わせで並んで進むため）。
      return {
        ...recordTurnFailure(settleUtterance(state), ending),
        turn: finishTurn(state.turn, at, ending),
        finishedTurnCount: finishedTurnCountOf(state),
        sdkTurn: CLOSED_SDK_TURN,
        apiTrouble: { kind: "none" },
      }
    }
    case "session-ended":
      // `diaryWriting` と見直しの欄はここでは動かさない（`turn-finished` と同じ理由）。
      return {
        ...settleUtterance(state),
        sdkTurn: CLOSED_SDK_TURN,
        endedReason: event.reason,
        turn: finishTurn(state.turn, at, { kind: "ended" }),
        finishedTurnCount: finishedTurnCountOf(state),
        backgroundTasks: [],
        apiTrouble: { kind: "none" },
      }
    case "api-retry":
      return { ...state, apiTrouble: { kind: "retrying", at, ...event.retry } }
    case "api-error":
      return { ...state, apiTrouble: { kind: "errored", error: event.error } }
    case "rate-limit-changed":
      return { ...state, rateLimit: event.rateLimit }
    case "conversation-cleared":
      // `/clear` で会話が消えたら、画面に残っている前の会話も消す（`records` も空にする）。
      // キャラクター・セッション情報・答え待ちの列は残す（`pending` の正典はサーバの待ち行列なので、状態側で空にすると実際の待ちと食い違う）。
      return {
        ...state,
        speeches: [],
        speechExpression: INITIAL_SPEECH_EXPRESSION,
        speechCalledInTurn: false,
        sdkTurn: clearedSdkTurn(state.sdkTurn),
        records: [],
        partialUtterance: "",
        welcomeGreeting: { kind: "none" },
      }
    case "tasks-changed":
      return { ...state, tasks: applyTaskSummaryChange(state.tasks, event.tasks) }
    case "recommendation-changed":
      return { ...state, recommendation: event.cards }
    case "welcome-greeting-changed":
      return { ...state, welcomeGreeting: event.state }
    case "reactions-written":
      return { ...state, writtenReactions: { kind: "written", reactions: event.reactions } }
    case "waiting-line-due":
    case "welcome-greeting-shown":
      return state
    case "sessions-changed":
      // `sessionId` もここで決まる（`session-info` は最初の依頼まで届かないので、それまで「いまどのセッションに居るか」を言えるのはこの経路だけ）。
      // 新規に起こしたときは `current` が undefined で、そのときは今の `session` を動かさない。
      // すでに `running` なら `permissionMode` は引き継ぎ、`sessionId` だけ差し替える。`starting` / `identified` からは `sessionId` だけの `identified` になる。
      return {
        ...state,
        sessions: event.sessions,
        session:
          event.current === undefined
            ? state.session
            : state.session.kind === "running"
              ? { ...state.session, sessionId: event.current }
              : { kind: "identified", sessionId: event.current },
      }
    case "character-changed": {
      // `kind` と `packs` を外すと、残りがちょうど `CharacterInfo`。
      // 項目を1つずつ手で写さないことで、`CharacterInfo` に項目が増えても畳み込みが黙って落とさない（`satisfies` で残りの形を検査する）。
      const { kind: _kind, packs, ...character } = event
      return { ...state, character: character satisfies CharacterInfo, characterPacks: packs }
    }
    case "token-usage":
    case "step-usage":
      // 画面に出すものが何も無い（数の記録は `~/.tsukumo/token-usage/` へ書くだけ）。ここで畳むとブラウザ側にも同じ数を持たせることになるので、姿は変えない。
      return state
    case "chat-mode-changed":
      return { ...state, chatMode: event.chat }
    case "chat-topics-changed":
      return { ...state, chatTopics: event.topics }
    case "remembered-lines-changed":
      return { ...state, rememberedLines: event.lines }
    case "items-changed":
      return { ...state, items: event.items, itemSeats: event.seats }
    case "session-default-changed":
      return { ...state, sessionDefault: event.sessionDefault }
    case "compact-boundary":
      return { ...state, records: [...state.records, { kind: "compact-boundary" }] }
    case "background-tasks-changed":
      return { ...state, backgroundTasks: event.tasks }
    case "usage-review-started":
    case "usage-review-stage":
    case "usage-review-result":
    case "usage-review-ended":
    case "usage-review-speech":
    case "usage-proposal-run-started":
    case "usage-proposal-run-ended":
    case "usage-proposal-dismissed":
      return {
        ...state,
        ...applyUsageReviewEvent(
          {
            usageReview: state.usageReview,
            previousUsageReview: state.previousUsageReview,
            usageProposalRun: state.usageProposalRun,
          },
          event,
          at,
        ),
      }
    case "diary-requested":
    case "diary-drafting":
    case "diary-stage":
    case "diary-written":
    case "diary-failed":
      return { ...state, diaryWriting: applyDiaryEvent(state.diaryWriting, event, at) }
  }
}

/** 新しい答え待ちの列に届いた時刻を打つ。前から待っている id は前の時刻のまま。 */
function stampPending(
  previous: readonly StampedPendingAsk[],
  next: readonly PendingAsk[],
  at: number,
): readonly StampedPendingAsk[] {
  return next.map((ask) => ({
    ...ask,
    askedAt: previous.find((waiting) => waiting.id === ask.id)?.askedAt ?? at,
  }))
}
