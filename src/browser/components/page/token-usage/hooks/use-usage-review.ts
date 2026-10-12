// トークン消費の画面の「減らし方を見てもらう」区画（ふだん・見直し中・結果）のロジック。
//
// 見直しと提案の実行は会話とは別の問い合わせで走り、見直し中かどうか・段の進み・セリフ・結果・前回の提案・提案の実行の様子は
// サーバの状態（`SessionState.usageReview` / `previousUsageReview` / `usageProposalRun`）が持つ。
// ここが畳むのは:
// - 経過時間の刻み（ローカルなタイマー）
// - 段の右に添える数（モデルの数・キャッシュ読み・ツールの種類）。
//   スキルからは受け取らず、既存の集計（手続き `tokenUsage.summary` に見直しの期間を渡す）から引く。
//   手続きの入力は選べる日数（1/7/30）だけなので、見直しの期間がそれ以外なら数を出さない
// - ボタンを押せない理由（提案の実行が走っている間だけ）。
//   結果の場面の主ボタン・「もう一度見てもらう」にも同じ理由を使う
// - 「前回の提案」を開いた・閉じたの1つの真偽値（`viewingPrevious`）。
//   `usageReview` はプロセスを起こし直すとふだんへ戻るので、「前回の結果を見ている」はサーバの状態に持たず、この区画だけのローカルな見た目にする

import { skipToken, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import {
  TOKEN_USAGE_DAYS_CHOICES,
  type TokenUsageDays,
  type TokenUsageSummary,
} from "../../../../../shared/token-usage/token-usage-summary.ts"
import {
  USAGE_REVIEW_STAGE_LABELS,
  USAGE_REVIEW_STAGES,
  usageProposalKey,
  type PreviousUsageReview,
  type UsageProposal,
  type UsageProposalImpact,
  type UsageProposalFollowUp,
  type UsageProposalRun,
  type UsageProposalRunOutcome,
  type UsageReviewFindings,
  type UsageReviewProgress,
  type UsageReviewSpeech,
  type UsageReviewStage,
} from "../../../../../shared/usage-review/usage-review.ts"
import { formatElapsed } from "../../../../../shared/utils/elapsed-time.ts"
import { characterFaceInfo, type CharacterFaceInfo } from "../../../../domain/character-face.ts"
import { rpc } from "../../../../domain/rpc.ts"
import { useSession, type SessionDispatch } from "../../../../stores/session.ts"
import {
  clockTime,
  localTimeZoneId,
  nowEpochMilliseconds,
  zonedDateTime,
} from "../../../../utils/clock.ts"
import { formatCount } from "../../../../utils/format-count.ts"
import { totalUsage } from "../domain/usage-format.ts"

const PROPOSAL_RUNNING_BLOCKED_REASON = "いま提案を頼んでいる。終わってからもう一度押す。"
const TICK_INTERVAL_MS = 1000

/** ボタンを押せるか（押せないときは理由を添える）。 */
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

/** 走っている見直しか提案の実行の直近のセリフ。まだ無ければ `none`。 */
export type UsageReviewSpeechView = UsageReviewSpeech

/**
 * 札1枚ぶんの提案の実行の様子。実行した提案（`usageProposalRun.key`）の札にだけ出す。
 *
 * - `none`: この提案はまだ頼んでいない（ほかの提案を頼んだ・一度も頼んでいない）
 * - `running`: 頼んでいる。経過・セリフ・止める口を添える
 * - `ended`: 終わった。次に頼むまで終わり方とセリフを出し続ける
 */
export type UsageProposalRunView =
  | { readonly kind: "none" }
  | {
      readonly kind: "running"
      readonly elapsedText: string
      readonly speech: UsageReviewSpeechView
      readonly onInterrupt: () => void
    }
  | {
      readonly kind: "ended"
      readonly outcome: UsageProposalRunOutcome
      readonly speech: UsageReviewSpeechView
    }

/** 「前回の提案」のリンク。無ければ出さない。 */
export type PreviousUsageReviewView =
  | { readonly kind: "none" }
  | { readonly kind: "found"; readonly dateLabel: string; readonly onOpen: () => void }

/**
 * 結果の場面を閉じて「前回の提案」を開く前の画面へ戻る口。
 * 実際の結果（`usageReview.kind === "result"`）には、戻る先の「ふだん」が無いので出さない。
 */
export type UsageReviewResultClose =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly onClose: () => void }

/** 結果の札1枚ぶんの見た目。 */
export type UsageReviewResultProposalView = {
  /** `usageProposalKey`。React の `key` と `usageReview.dismissProposal` の的の両方に使う。 */
  readonly key: string
  readonly impact: UsageProposalImpact
  readonly title: string
  readonly basis: string
  readonly action: string
  /** 主ボタンの押す口（`delegate` / `task`）。文言は見た目の側が持つ。 */
  readonly followUp: UsageProposalFollowUp
  /** 主ボタンを押すと `usageReview.runProposal` を1回送る。 */
  readonly onPrimary: () => void
  /** 「見送る」を押すと `usageReview.dismissProposal` を1回送る。 */
  readonly onDismiss: () => void
  readonly run: UsageProposalRunView
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
      /**
       * 「もう一度見てもらう」を押せるか。押せないときは各提案の主ボタンも押せない。
       * 押せない理由を主ボタンの数だけ繰り返さずここに1つだけ出す。
       */
      readonly retry: UsageReviewStartAvailability
      readonly onRetry: () => void
      /** 「前回の提案」から開いたときだけ「閉じる」を出す。 */
      readonly close: UsageReviewResultClose
    }
)

export function useUsageReview(): UseUsageReviewResult {
  const dispatch = useSession((session) => session.dispatch)
  const usageReview = useSession((session) => session.state.usageReview)
  const previousUsageReview = useSession((session) => session.state.previousUsageReview)
  const usageProposalRun = useSession((session) => session.state.usageProposalRun)
  const character = useSession((session) => session.state.character)
  const [viewingPrevious, setViewingPrevious] = useState(false)

  const reviewDays =
    usageReview.kind === "running" && usageReview.progress.kind === "stage"
      ? asTokenUsageDays(usageReview.progress.days)
      : undefined
  const summary = useReviewStageSummary(reviewDays)

  const [now, setNow] = useState(() => nowEpochMilliseconds())
  const ticking = usageReview.kind === "running" || usageProposalRun.kind === "running"
  useEffect(() => {
    if (!ticking) {
      return undefined
    }
    const timer = setInterval(() => setNow(nowEpochMilliseconds()), TICK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [ticking])

  const face = characterFaceInfo(character)
  const start = () => {
    setViewingPrevious(false)
    dispatch.usageReview.start()
  }
  const interrupt = () => {
    dispatch.usageReview.interrupt()
  }
  const elapsedText = (startedAt: number): string =>
    formatElapsed(Math.max(0, Math.floor((now - startedAt) / 1000)))
  const proposalActions: ProposalActions = {
    dispatch,
    run: usageProposalRun,
    elapsedText,
    interrupt,
  }
  const availability = startAvailability(usageProposalRun)

  if (usageReview.kind === "running") {
    return {
      kind: "running",
      face,
      elapsedText: elapsedText(usageReview.startedAt),
      speech: usageReview.speech,
      onInterrupt: interrupt,
      stages: stageViews(usageReview.progress, summary),
    }
  }

  if (usageReview.kind === "result") {
    return {
      kind: "result",
      face,
      ...resultView(usageReview.reviewedAt, usageReview.findings, proposalActions),
      retry: availability,
      onRetry: start,
      close: { kind: "none" },
    }
  }

  if (viewingPrevious && previousUsageReview.kind === "found") {
    return {
      kind: "result",
      face,
      ...resultView(previousUsageReview.reviewedAt, previousUsageReview.findings, proposalActions),
      retry: availability,
      onRetry: start,
      close: { kind: "shown", onClose: () => setViewingPrevious(false) },
    }
  }

  return {
    kind: "idle",
    face,
    start: availability,
    onStart: start,
    previousReview: previousReviewView(previousUsageReview, () => setViewingPrevious(true)),
  }
}

type ProposalActions = {
  readonly dispatch: SessionDispatch
  readonly run: UsageProposalRun
  readonly elapsedText: (startedAt: number) => string
  readonly interrupt: () => void
}

/** 見直しも提案の実行も1度に1つだけ走るので、提案の実行が走っている間は始められない。 */
function startAvailability(run: UsageProposalRun): UsageReviewStartAvailability {
  return run.kind === "running"
    ? { kind: "blocked", reason: PROPOSAL_RUNNING_BLOCKED_REASON }
    : { kind: "available" }
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
 * 結果の場面の中身（頭の日時・期間・一言・提案の並び）。
 * 今回の結果（`usageReview.kind === "result"`）と「前回の提案」を開いたとき（`previousUsageReview`）の両方を同じ札の形で出すので、組み立てをここ1つに揃える。
 */
function resultView(
  reviewedAt: number,
  findings: UsageReviewFindings,
  actions: ProposalActions,
): Pick<
  Extract<UseUsageReviewResult, { readonly kind: "result" }>,
  "reviewedAtLabel" | "periodLabel" | "headline" | "proposals"
> {
  return {
    reviewedAtLabel: reviewedAtLabel(reviewedAt),
    periodLabel: periodLabel(findings.days),
    headline: findings.headline,
    proposals: findings.proposals.map((proposal) => {
      const key = usageProposalKey(proposal)
      const target = proposalTarget(proposal)
      return {
        key,
        impact: proposal.impact,
        title: proposal.title,
        basis: proposal.basis,
        action: proposal.action,
        followUp: proposal.followUp,
        onPrimary: () => actions.dispatch.usageReview.runProposal(target),
        onDismiss: () => actions.dispatch.usageReview.dismissProposal(target),
        run: proposalRunView(key, actions),
      }
    }),
  }
}

function proposalTarget(proposal: UsageProposal): Pick<UsageProposal, "kind" | "target"> {
  return { kind: proposal.kind, target: proposal.target }
}

/** 提案の実行の様子を、実行した提案の札にだけ出す。 */
function proposalRunView(key: string, actions: ProposalActions): UsageProposalRunView {
  const { run } = actions
  if (run.kind === "idle" || run.key !== key) {
    return { kind: "none" }
  }
  if (run.kind === "running") {
    return {
      kind: "running",
      elapsedText: actions.elapsedText(run.startedAt),
      speech: run.speech,
      onInterrupt: actions.interrupt,
    }
  }
  return { kind: "ended", outcome: run.outcome, speech: run.speech }
}

/** 段の並び（{@link USAGE_REVIEW_STAGES}）より前は済、いまの段は進行中、後は未着手。最初の段が届くまでは全部未着手。 */
function stageViews(
  progress: UsageReviewProgress,
  summary: TokenUsageSummary | undefined,
): readonly UsageReviewStageView[] {
  const currentIndex = progress.kind === "stage" ? USAGE_REVIEW_STAGES.indexOf(progress.stage) : -1
  return USAGE_REVIEW_STAGES.map((stage, index) => ({
    stage,
    label: USAGE_REVIEW_STAGE_LABELS[stage],
    status: index < currentIndex ? "done" : index === currentIndex ? "running" : "pending",
    count: stageCount(stage, summary),
  }))
}

/** モデル・キャッシュ・ツールの3段だけ数を持つ。 */
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
 * 見直し中の段の右の数を引く集計。
 * 画面が使う集計と同じ手続き（`tokenUsage.summary`）を、いまの期間の選択とは別に引く（同じ日数ならキャッシュを分け合う）。
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

/** 見た期間の一言。1日だけは「今日」、それ以外は「直近 N 日」。 */
function periodLabel(days: number): string {
  return days === 1 ? "今日" : `直近 ${String(days)} 日`
}
