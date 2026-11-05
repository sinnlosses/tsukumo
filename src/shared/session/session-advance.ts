// イベント1件を畳み込んで次のセッションの姿を返す純粋関数。
// 時刻は畳み込みの中で時計を読まず、イベントに打たれた `at`（エポックミリ秒）を受け取る（サーバとブラウザの状態が同じになるように、時刻はイベントの発生側が決める）。

import type { CharacterInfo } from "../character-pack/character.ts"
import { isModelAlias } from "../command.ts"
import { applyDiaryEvent, type DiaryEvent } from "../diary/diary.ts"
import { applyTaskSummaryChange } from "../repository/task-summary-change.ts"
import type { PendingAsk, StampedPendingAsk } from "../session-driver/pending-ask.ts"
import { applyUsageReviewEvent, type UsageReviewEvent } from "../usage/usage-review.ts"
import { isBlankText } from "../utils/blank-text.ts"
import { clipText } from "../utils/clip-text.ts"
import { commandCandidates } from "./command-suggestion.ts"
import {
  advanceByQuestionAnswered,
  advanceByReport,
  advanceBySpeech,
  advanceByToolStarted,
} from "./session-advance-record.ts"
import { advanceByWorkflowProgress, advanceByWorkflowStep } from "./session-advance-workflow.ts"
import { isSessionEventKind } from "./session-event-kind.ts"
import type { SessionEvent } from "./session-event.ts"
import { permissionModeValue } from "./session-info.ts"
import {
  settleUtterance,
  trimToRecentTurns,
  withReportChangeSummary,
  withReportVerification,
  workPlanRecordOf,
  workPlanRecords,
} from "./session-record-edit.ts"
import { MAX_TOOL_TEXT_LENGTH } from "./session-record.ts"
import type { SessionState } from "./session-state.ts"
import { originOf, withAcceptedMark, withConfirmedMark } from "./setting-mark.ts"
import { finishTool, notifyBackgroundEnd } from "./tool-record.ts"
import {
  beginAside,
  beginTurn,
  clearedSdkTurn,
  CLOSED_SDK_TURN,
  finishedTurnCountOf,
  finishTurn,
  INITIAL_SPEECH_EXPRESSION,
  recordTurnFailure,
  resumeTurn,
  addDraftComponent,
  holdReportDrafting,
  startReportDrafting,
  settleReportDrafting,
  turnEnding,
  withOpenSdkTurn,
} from "./turn-progress.ts"
import { workflowItemsOfTasks } from "./workflow-step.ts"

/** 種類ごとの畳み方の表の形。種類が欠けると {@link SESSION_EVENT_FOLDS} が型検査で落ちる。 */
type SessionEventFolds = {
  readonly [K in SessionEvent["kind"]]: (
    state: SessionState,
    event: Extract<SessionEvent, { readonly kind: K }>,
    at: number,
  ) => SessionState
}

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
  "report-draft-component",
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
  const clearsApiTrouble =
    MODEL_OUTPUT_EVENT_KINDS.has(event.kind) && state.apiTrouble.kind !== "none"
  return foldSessionEvent(
    clearsApiTrouble ? { ...state, apiTrouble: { kind: "none" } } : state,
    event.kind,
    event,
    at,
  )
}

/** {@link advanceSessionState} の本体（API の不調を下ろしたあとの姿に、イベント1件を畳む）。 */
function foldSessionEvent<K extends SessionEvent["kind"]>(
  state: SessionState,
  kind: K,
  event: Extract<SessionEvent, { readonly kind: K }>,
  at: number,
): SessionState {
  const folds: SessionEventFolds = SESSION_EVENT_FOLDS
  return folds[kind](state, event, at)
}

const SESSION_EVENT_FOLDS = {
  "session-info": (state, event) => ({
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
  }),
  "command-descriptions": (state, event) => ({ ...state, commandDescriptions: event.descriptions }),
  plan: (state, event) => ({ ...state, plan: event.plan }),
  // `MODEL_ALIASES` に完全一致するときだけ先回りで更新する（`/model best` のような tsukumo が知らない値では状態を変えず、次の `init` を待つ）。
  // `session.kind` は見ない（`running` に絞ると、切り替えても数秒で古い値に戻って見える。`SessionInfo` の doc コメント）。
  "model-changed": (state, event, at) =>
    withAcceptedMark(
      isModelAlias(event.model) ? { ...state, model: event.model } : state,
      "model",
      event.model,
      originOf(state.model),
      at,
    ),
  "model-effort-support": (state, event) => ({ ...state, modelEffortSupport: event.models }),
  "effort-changed": (state, event, at) =>
    withAcceptedMark(
      { ...state, effort: event.effort },
      "effort",
      event.effort,
      originOf(state.effort),
      at,
    ),
  // 許可モードは次の `init` まで `session` の値が変わらないので、切り替える前に効いていた値が残っている。
  "permission-mode-changed": (state, event, at) =>
    withAcceptedMark(
      state,
      "permissionMode",
      event.mode,
      originOf(
        state.session.kind === "running"
          ? permissionModeValue(state.session.permissionMode)
          : undefined,
      ),
      at,
    ),
  "setting-confirmed": (state, event, at) =>
    withConfirmedMark(
      event.setting === "effort" ? { ...state, effort: event.value } : state,
      event,
      at,
    ),
  request: (state, event, at) => ({
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
  }),
  aside: (state, event, at) => ({
    ...beginAside(state, at),
    records: [
      ...state.records,
      { kind: "aside", text: event.text, images: event.images, time: { kind: "stamped", at } },
    ],
  }),
  // 記録を持たないターンの始まり。積むものが無いだけで、吹き出し・表情・進行中の印は `request` と同じに動かす。
  "turn-started": (state, _event, at) => beginTurn(state, at),
  "turn-resumed": (state, _event, at) => resumeTurn(state, at),
  "partial-utterance": (state, event) => ({
    ...state,
    partialUtterance: state.partialUtterance + event.text,
  }),
  utterance: (state, event) =>
    settleUtterance({
      ...(isBlankText(event.text)
        ? state
        : withOpenSdkTurn(state, (open) => ({
            ...open,
            bodies: { ...open.bodies, utterance: true },
          }))),
      partialUtterance: event.text,
    }),
  speech: advanceBySpeech,
  // サーバの中で `speech` に変わってから届く（`CallReview`）。
  "speak-called": keepState,
  "speak-drawn": keepState,
  // サーバの中で `work-plan` に変わってから届く（`CallReview`）。
  "work-plan-called": keepState,
  // サーバの中で `CallReview` が受けて捨てる。
  "phase-result-called": keepState,
  "delegate-handed-back": keepState,
  "workflow-started": keepState,
  "task-notified": keepState,
  "workflow-step-started": advanceByWorkflowStep,
  "workflow-step-finished": advanceByWorkflowStep,
  "workflow-progress": advanceByWorkflowProgress,
  "delegate-returned": (state, event, at) => ({
    ...state,
    records: [...state.records, ...workPlanRecords(state.records, event, at)],
  }),
  "report-malformed": keepState,
  "report-rejected": keepState,
  "report-counted": keepState,
  "report-drafting": (state, event) => startReportDrafting(state, event.toolUseId),
  "report-draft-component": (state, event) =>
    addDraftComponent(state, event.toolUseId, event.component),
  report: advanceByReport,
  "report-change-summary": withReportChangeSummary,
  "report-verification": withReportVerification,
  "work-plan": (state, event, at) => ({
    ...state,
    records: [...state.records, workPlanRecordOf(state.records, event, at)],
  }),
  "tool-started": advanceByToolStarted,
  "background-tool-finished": (state, event, at) => notifyBackgroundEnd(state, event.toolUseId, at),
  // 駆動が送り出す手前で捨てる。
  "delegate-progress": keepState,
  "progress-nudged": keepState,
  "tool-finished": (state, event, at) =>
    finishTool(
      event.isError
        ? holdReportDrafting(state, event.toolUseId)
        : settleReportDrafting(state, event.toolUseId),
      event.toolUseId,
      event.isError
        ? { kind: "failed", output: clipText(event.content, MAX_TOOL_TEXT_LENGTH) }
        : { kind: "succeeded" },
      at,
    ),
  "pending-changed": (state, event, at) => ({
    ...state,
    pending: stampPending(state.pending, event.pending, at),
  }),
  "question-answered": advanceByQuestionAnswered,
  // 書きかけのまま終わったターン（中断など）の本文を捨てず、確定した記録に移す。
  "turn-finished": (state, event, at) => {
    const ending = turnEnding(event.outcome, state.apiTrouble)
    // `diaryWriting` と見直しの欄はここでは動かさない（どちらも会話とは別の使い捨ての問い合わせで並んで進むため）。
    return {
      ...recordTurnFailure(settleUtterance(state), ending),
      turn: finishTurn(state.turn, at, ending),
      finishedTurnCount: finishedTurnCountOf(state),
      sdkTurn: CLOSED_SDK_TURN,
      apiTrouble: { kind: "none" },
    }
  },
  // `diaryWriting` と見直しの欄はここでは動かさない（`turn-finished` と同じ理由）。
  "session-ended": (state, event, at) => ({
    ...settleUtterance(state),
    sdkTurn: CLOSED_SDK_TURN,
    endedReason: event.reason,
    turn: finishTurn(state.turn, at, { kind: "ended" }),
    finishedTurnCount: finishedTurnCountOf(state),
    backgroundTasks: [],
    workflowSteps: [],
    workflowProgress: [],
    apiTrouble: { kind: "none" },
  }),
  "api-retry": (state, event, at) => ({
    ...state,
    apiTrouble: { kind: "retrying", at, ...event.retry },
  }),
  "api-error": (state, event) => ({
    ...state,
    apiTrouble: { kind: "errored", error: event.error },
  }),
  "rate-limit-changed": (state, event) => ({ ...state, rateLimit: event.rateLimit }),
  // `/clear` で会話が消えたら、画面に残っている前の会話も消す（`records` も空にする）。
  // キャラクター・セッション情報・答え待ちの列は残す（`pending` の正典はサーバの待ち行列なので、状態側で空にすると実際の待ちと食い違う）。
  "conversation-cleared": (state) => ({
    ...state,
    speeches: [],
    speechExpression: INITIAL_SPEECH_EXPRESSION,
    speechCalledInTurn: false,
    sdkTurn: clearedSdkTurn(state.sdkTurn),
    records: [],
    partialUtterance: "",
    welcomeGreeting: { kind: "none" },
  }),
  "tasks-changed": (state, event) => ({
    ...state,
    tasks: applyTaskSummaryChange(state.tasks, event.tasks),
  }),
  "recommendation-changed": (state, event) => ({ ...state, recommendation: event.cards }),
  "welcome-greeting-changed": (state, event) => ({ ...state, welcomeGreeting: event.state }),
  "reactions-written": (state, event) => ({
    ...state,
    writtenReactions: { kind: "written", reactions: event.reactions },
  }),
  "waiting-line-due": keepState,
  "welcome-greeting-shown": keepState,
  // `sessionId` もここで決まる（`session-info` は最初の依頼まで届かないので、それまで「いまどのセッションに居るか」を言えるのはこの経路だけ）。
  // 新規に起こしたときは `current` が undefined で、そのときは今の `session` を動かさない。
  // すでに `running` なら `permissionMode` は引き継ぎ、`sessionId` だけ差し替える。`starting` / `identified` からは `sessionId` だけの `identified` になる。
  "sessions-changed": (state, event) => ({
    ...state,
    sessions: event.sessions,
    session:
      event.current === undefined
        ? state.session
        : state.session.kind === "running"
          ? { ...state.session, sessionId: event.current }
          : { kind: "identified", sessionId: event.current },
  }),
  "character-changed": (state, event) => {
    // `kind` と `packs` を外すと、残りがちょうど `CharacterInfo`。
    // 項目を1つずつ手で写さないことで、`CharacterInfo` に項目が増えても畳み込みが黙って落とさない（`satisfies` で残りの形を検査する）。
    const { kind: _kind, packs, ...character } = event
    return { ...state, character: character satisfies CharacterInfo, characterPacks: packs }
  },
  // 画面に出すものが何も無い（数の記録は `~/.tsukumo/token-usage/` へ書くだけ）。ここで畳むとブラウザ側にも同じ数を持たせることになるので、姿は変えない。
  "token-usage": keepState,
  "step-usage": keepState,
  "chat-mode-changed": (state, event) => ({ ...state, chatMode: event.chat }),
  "chat-topics-changed": (state, event) => ({ ...state, chatTopics: event.topics }),
  "chat-consolidation-halted": (state, event) => ({
    ...state,
    chatConsolidationHalt: { halted: true, failures: event.failures },
  }),
  "remembered-lines-changed": (state, event) => ({ ...state, rememberedLines: event.lines }),
  "items-changed": (state, event) => ({ ...state, items: event.items, itemSeats: event.seats }),
  "session-default-changed": (state, event) => ({
    ...state,
    sessionDefault: event.sessionDefault,
  }),
  "compact-boundary": (state) => ({
    ...state,
    records: [...state.records, { kind: "compact-boundary" }],
  }),
  "background-tasks-changed": (state, event) => ({
    ...state,
    backgroundTasks: event.tasks,
    workflowSteps: workflowItemsOfTasks(state.workflowSteps, event.tasks),
    workflowProgress: workflowItemsOfTasks(state.workflowProgress, event.tasks),
  }),
  "usage-review-started": advanceByUsageReview,
  "usage-review-stage": advanceByUsageReview,
  "usage-review-result": advanceByUsageReview,
  "usage-review-ended": advanceByUsageReview,
  "usage-review-speech": advanceByUsageReview,
  "usage-proposal-run-started": advanceByUsageReview,
  "usage-proposal-run-ended": advanceByUsageReview,
  "usage-proposal-dismissed": advanceByUsageReview,
  "diary-requested": advanceByDiary,
  "diary-drafting": advanceByDiary,
  "diary-stage": advanceByDiary,
  "diary-written": advanceByDiary,
  "diary-failed": advanceByDiary,
} satisfies SessionEventFolds

function keepState(state: SessionState): SessionState {
  return state
}

function advanceByUsageReview(
  state: SessionState,
  event: UsageReviewEvent,
  at: number,
): SessionState {
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
}

function advanceByDiary(state: SessionState, event: DiaryEvent, at: number): SessionState {
  return { ...state, diaryWriting: applyDiaryEvent(state.diaryWriting, event, at) }
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
