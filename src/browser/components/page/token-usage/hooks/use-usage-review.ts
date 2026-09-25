// トークン消費の画面の「減らし方を見てもらう」区画（ふだん・見直し中・結果）のロジック
// （docs/design.md 2章「機能の中を分ける」）。見た目は `../usage-review-card.tsx` へ渡す。
//
// **見直し中かどうか・段の進み・結果・前回の提案はサーバの状態が持つ**
// （`SessionState.usageReview` / `previousUsageReview`。docs/design.md「見直しのツールと状態」）。
// ここが畳むのは:
// - 経過時間の刻み（`dispatch/hooks/use-turn-status.ts` と同じ、ローカルなタイマー。
//   `../../../../domain/elapsed-time.ts` を共有する）
// - 段の右に添える数（モデルの数・キャッシュ読み・ツールの種類）。**スキルからは受け取らず**、
//   既存の集計（手続き `tokenUsage.summary` に見直しの期間を渡す）から引く（design.md 決定）。
//   **見直しの期間が選べる日数（1/7/30）でなければ数を出さない**——手続きの入力は選べる日数
//   だけなので、それ以外の値では引けない
// - ボタンを押せない理由（ターンが進行中・雑談中。「解くべき論点」への回答。結果の場面の
//   主ボタン・「もう一度見てもらう」にも同じ理由を使う——どちらも会話へ依頼を送る点は同じ）
// - 「前回の提案」を開いた・閉じたの1つの真偽値（`viewingPrevious`）。**サーバの状態には無い**
//   ——`usageReview` は起こし直すとふだんへ戻る決まりのままにし、「前回の結果を見ている」は
//   この区画だけのローカルな見た目の話にする（docs/screen-design.md 13.2「前回の提案」）

import { skipToken, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import {
  TOKEN_USAGE_DAYS_CHOICES,
  type TokenUsageDays,
  type TokenUsageSummary,
} from "../../../../../shared/token-usage-summary.ts"
import {
  USAGE_REVIEW_REQUEST_TEXT,
  USAGE_REVIEW_STAGE_LABELS,
  USAGE_REVIEW_STAGES,
  usageProposalKey,
  usageProposalRequestText,
  type PreviousUsageReview,
  type UsageProposal,
  type UsageProposalImpact,
  type UsageProposalFollowUp,
  type UsageReviewFindings,
  type UsageReviewStage,
} from "../../../../../shared/usage-review.ts"
import { characterFaceInfo, type CharacterFaceInfo } from "../../../../domain/character-face.ts"
import { formatElapsed } from "../../../../domain/elapsed-time.ts"
import { rpc } from "../../../../lib/rpc-client.ts"
import {
  useSessionDispatch,
  useSessionSelector,
  useTurnRunning,
  type SessionDispatch,
} from "../../../../stores/session.tsx"
import {
  clockTime,
  localTimeZoneId,
  nowEpochMilliseconds,
  zonedDateTime,
} from "../../../../utils/clock.ts"
import { formatCount } from "../../../../utils/format-count.ts"
import { totalUsage } from "../usage-format.ts"

const CHAT_MODE_BLOCKED_REASON = "雑談中は使えない。仕事に切り替えてから押す。"
const TURN_RUNNING_BLOCKED_REASON = "いまターンが動いているので送れない。終わってからもう一度押す。"
const TICK_INTERVAL_MS = 1000

/** ボタンを押せるか（押せないときは理由を添える。「解くべき論点」への回答）。 */
export type UsageReviewStartAvailability =
  | { readonly kind: "available" }
  | { readonly kind: "blocked"; readonly reason: string }

/** 段の右に添える数。数える元が無い段（コンテキスト・見直し案）は常に `none`。 */
export type UsageReviewStageCount =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly label: string }

export type UsageReviewStageStatus = "done" | "running" | "pending"

/** 段1つぶんの見た目。 */
export type UsageReviewStageView = {
  readonly stage: UsageReviewStage
  readonly label: string
  readonly status: UsageReviewStageStatus
  readonly count: UsageReviewStageCount
}

/** 直近のセリフ（吹き出しと同じ最新の `speak`。「解くべき論点」への回答）。まだ無ければ `none`。 */
export type UsageReviewSpeechView =
  | { readonly kind: "none" }
  | { readonly kind: "said"; readonly text: string }

/** 「前回の提案」のリンク。無ければ出さない。 */
export type PreviousUsageReviewView =
  | { readonly kind: "none" }
  | { readonly kind: "found"; readonly dateLabel: string; readonly onOpen: () => void }

/** 結果の場面を閉じて「前回の提案」を開く前の画面へ戻る口。実際の結果（`usageReview.kind
 * === "result"`）には出さない——戻る先の「ふだん」が無いため。 */
export type UsageReviewResultClose =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly onClose: () => void }

/** 結果の札1枚ぶんの見た目（`docs/glossary.md`「提案」）。 */
export type UsageReviewResultProposalView = {
  /** `usageProposalKey`。React の `key` と `usageReview.dismissProposal` の的の両方に使う。 */
  readonly key: string
  readonly impact: UsageProposalImpact
  readonly title: string
  readonly basis: string
  readonly action: string
  /** 主ボタンの押す口（`delegate` / `task`）。文言は見た目の側（`usage-review-card.tsx`）が持つ。 */
  readonly followUp: UsageProposalFollowUp
  /** 主ボタンを押すと会話へ依頼を1回送る。 */
  readonly onPrimary: () => void
  /** 「見送る」を押すと `usageReview.dismissProposal` を1回送る。 */
  readonly onDismiss: () => void
}

export type UseUsageReviewResult = {
  /** キャラクターの顔（`<CharacterFace>`。ふだん・見直し中・結果のどれにも出す）。 */
  readonly face: CharacterFaceInfo
} & (
  | {
      readonly kind: "idle"
      readonly start: UsageReviewStartAvailability
      readonly onStart: () => void
      readonly previousReview: PreviousUsageReviewView
    }
  | {
      readonly kind: "running"
      readonly elapsedText: string
      readonly speech: UsageReviewSpeechView
      readonly onInterrupt: () => void
      readonly stages: readonly UsageReviewStageView[]
    }
  | {
      readonly kind: "result"
      /** 「[MM-DD HH:MM]」の形（この端末のローカルの日時）。 */
      readonly reviewedAtLabel: string
      /** 「直近 N 日」（1日だけは「今日」）。 */
      readonly periodLabel: string
      readonly headline: string
      /** 空なら「いま出せる提案は無い」の一言を出す（見送りきった・スキルが挙げなかったの両方）。 */
      readonly proposals: readonly UsageReviewResultProposalView[]
      /** 「もう一度見てもらう」を押せるか（ふだんの「減らし方を見てもらう」と同じ理由）。
       * 押せないときは各提案の主ボタンも押せない——どちらも会話へ依頼を送る点は同じなので、
       * 「ターンが動いている」を主ボタンの数だけ繰り返さずここに1つだけ出す。 */
      readonly retry: UsageReviewStartAvailability
      readonly onRetry: () => void
      /** 「前回の提案」から開いたときだけ「閉じる」を出す。 */
      readonly close: UsageReviewResultClose
    }
)

export function useUsageReview(): UseUsageReviewResult {
  const dispatch = useSessionDispatch()
  const turnRunning = useTurnRunning()
  const chatMode = useSessionSelector((session) => session.state.chatMode)
  const usageReview = useSessionSelector((session) => session.state.usageReview)
  const previousUsageReview = useSessionSelector((session) => session.state.previousUsageReview)
  const character = useSessionSelector((session) => session.state.character)
  const speeches = useSessionSelector((session) => session.state.speeches)
  const [viewingPrevious, setViewingPrevious] = useState(false)

  const reviewDays = usageReview.kind === "running" ? asTokenUsageDays(usageReview.days) : undefined
  const summary = useReviewStageSummary(reviewDays)

  const [now, setNow] = useState(() => nowEpochMilliseconds())
  useEffect(() => {
    if (usageReview.kind !== "running") {
      return undefined
    }
    const timer = setInterval(() => setNow(nowEpochMilliseconds()), TICK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [usageReview])

  const face = characterFaceInfo(character)
  const start = () => {
    setViewingPrevious(false)
    dispatch.session.prompt({ text: USAGE_REVIEW_REQUEST_TEXT, images: [] })
  }
  const dismiss = (proposal: UsageProposal): void => {
    dispatch.usageReview.dismissProposal({ kind: proposal.kind, target: proposal.target })
  }

  if (usageReview.kind === "running") {
    return {
      kind: "running",
      face,
      elapsedText: formatElapsed(Math.max(0, Math.floor((now - usageReview.startedAt) / 1000))),
      speech: latestSpeechView(speeches),
      onInterrupt: () => dispatch.session.interrupt(),
      stages: stageViews(usageReview.stage, summary),
    }
  }

  if (usageReview.kind === "result") {
    return {
      kind: "result",
      face,
      ...resultView(usageReview.reviewedAt, usageReview.findings, dispatch, dismiss),
      retry: startAvailability(chatMode, turnRunning),
      onRetry: start,
      close: { kind: "none" },
    }
  }

  if (viewingPrevious && previousUsageReview.kind === "found") {
    return {
      kind: "result",
      face,
      ...resultView(
        previousUsageReview.reviewedAt,
        previousUsageReview.findings,
        dispatch,
        dismiss,
      ),
      retry: startAvailability(chatMode, turnRunning),
      onRetry: start,
      close: { kind: "shown", onClose: () => setViewingPrevious(false) },
    }
  }

  return {
    kind: "idle",
    face,
    start: startAvailability(chatMode, turnRunning),
    onStart: start,
    previousReview: previousReviewView(previousUsageReview, () => setViewingPrevious(true)),
  }
}

function startAvailability(chatMode: boolean, turnRunning: boolean): UsageReviewStartAvailability {
  if (chatMode) {
    return { kind: "blocked", reason: CHAT_MODE_BLOCKED_REASON }
  }
  if (turnRunning) {
    return { kind: "blocked", reason: TURN_RUNNING_BLOCKED_REASON }
  }
  return { kind: "available" }
}

function previousReviewView(
  previous: PreviousUsageReview,
  onOpen: () => void,
): PreviousUsageReviewView {
  if (previous.kind === "none") {
    return { kind: "none" }
  }
  return { kind: "found", dateLabel: monthDayLabel(previous.reviewedAt), onOpen }
}

/**
 * 結果の場面の中身（頭の日時・期間・一言・提案の並び）。**今回の結果（`usageReview.kind ===
 * "result"`）と「前回の提案」を開いたとき（`previousUsageReview`）の両方から呼ぶ**——同じ札の
 * 形で出す決まり（「解くべき論点」への回答。docs/screen-design.md 13.2）なので組み立ても1つに
 * 揃える。
 */
function resultView(
  reviewedAt: number,
  findings: UsageReviewFindings,
  dispatch: SessionDispatch,
  dismiss: (proposal: UsageProposal) => void,
): Pick<
  Extract<UseUsageReviewResult, { readonly kind: "result" }>,
  "reviewedAtLabel" | "periodLabel" | "headline" | "proposals"
> {
  return {
    reviewedAtLabel: reviewedAtLabel(reviewedAt),
    periodLabel: periodLabel(findings.days),
    headline: findings.headline,
    proposals: findings.proposals.map((proposal) => ({
      key: usageProposalKey(proposal),
      impact: proposal.impact,
      title: proposal.title,
      basis: proposal.basis,
      action: proposal.action,
      followUp: proposal.followUp,
      onPrimary: () =>
        dispatch.session.prompt({ text: usageProposalRequestText(proposal), images: [] }),
      onDismiss: () => dismiss(proposal),
    })),
  }
}

/** 直近のセリフ（吹き出しと同じ `state.speeches` の最後の1件）。 */
function latestSpeechView(speeches: readonly string[]): UsageReviewSpeechView {
  const text = speeches.at(-1)
  return text === undefined ? { kind: "none" } : { kind: "said", text }
}

/** 段の並び（{@link USAGE_REVIEW_STAGES}）より前は済、いまの段は進行中、後は未着手。 */
function stageViews(
  currentStage: UsageReviewStage,
  summary: TokenUsageSummary | undefined,
): readonly UsageReviewStageView[] {
  const currentIndex = USAGE_REVIEW_STAGES.indexOf(currentStage)
  return USAGE_REVIEW_STAGES.map((stage, index) => ({
    stage,
    label: USAGE_REVIEW_STAGE_LABELS[stage],
    status: index < currentIndex ? "done" : index === currentIndex ? "running" : "pending",
    count: stageCount(stage, summary),
  }))
}

/** モデル・キャッシュ・ツールの3段だけ数を持つ（design.md「見直しのツールと状態」決定）。 */
function stageCount(
  stage: UsageReviewStage,
  summary: TokenUsageSummary | undefined,
): UsageReviewStageCount {
  if (summary === undefined) {
    return { kind: "none" }
  }
  if (stage === "model") {
    return { kind: "shown", label: `${String(summary.byModel.length)} モデル` }
  }
  if (stage === "cache") {
    const cacheRead = totalUsage(summary.byModel).cacheReadInputTokens
    return { kind: "shown", label: `読み ${formatCount(cacheRead)}` }
  }
  if (stage === "tool") {
    return { kind: "shown", label: `${String(summary.byTool.length)} 種類` }
  }
  return { kind: "none" }
}

/** `TOKEN_USAGE_DAYS_CHOICES`（1/7/30）に無い日数は集計を引かない。 */
function asTokenUsageDays(days: number): TokenUsageDays | undefined {
  return TOKEN_USAGE_DAYS_CHOICES.find((choice) => choice === days)
}

/**
 * 見直し中の段の右の数を引く集計。**見直しの画面が使う集計と同じ手続き**
 * （`tokenUsage.summary`）を、いまの期間の選択とは別に引く（同じ日数ならキャッシュを分け合う）。
 */
function useReviewStageSummary(days: TokenUsageDays | undefined): TokenUsageSummary | undefined {
  const query = useQuery(
    rpc.tokenUsage.summary.queryOptions({
      input: days === undefined ? skipToken : { days },
      staleTime: 0,
    }),
  )
  return query.data
}

/** 「前回の提案（09-16）」の日付部分。この端末のローカルの日で読む。 */
function monthDayLabel(epochMilliseconds: number): string {
  const zoned = zonedDateTime(epochMilliseconds, localTimeZoneId())
  return `${String(zoned.month).padStart(2, "0")}-${String(zoned.day).padStart(2, "0")}`
}

/** 結果の場面の頭に出す日時（`MM-DD HH:MM`。この端末のローカルの日時）。 */
function reviewedAtLabel(epochMilliseconds: number): string {
  const zoned = zonedDateTime(epochMilliseconds, localTimeZoneId())
  return `${monthDayLabel(epochMilliseconds)} ${clockTime(zoned)}`
}

/** 見た期間の一言。**1日だけは「今日」**（`presentational-token-usage-screen.tsx` の期間の
 * 切り替えと同じ言い換え）、それ以外は「直近 N 日」。 */
function periodLabel(days: number): string {
  return days === 1 ? "今日" : `直近 ${String(days)} 日`
}
