// トークン消費の画面の「減らし方を見てもらう」区画（ふだん・見直し中）のロジック
// （docs/design.md 2章「機能の中を分ける」）。見た目は `../usage-review-card.tsx` へ渡す。
//
// **見直し中かどうか・段の進み・前回の提案はサーバの状態が持つ**
// （`SessionState.usageReview` / `previousUsageReview`。docs/design.md「見直しのツールと状態」）。
// ここが畳むのは:
// - 経過時間の刻み（`dispatch/hooks/use-turn-status.ts` と同じ、ローカルなタイマー。
//   `../../../domain/elapsed-time.ts` を共有する）
// - 段の右に添える数（モデルの数・キャッシュ読み・ツールの種類）。**スキルからは受け取らず**、
//   既存の集計（`GET /token-usage?days=<見直しの期間>`）から引く（design.md 決定）。
//   **見直しの期間が選べる日数（1/7/30）でなければ数を出さない**——それ以外の値で集計を引くと
//   `readTokenUsageDays` が既定の7日に落ちて、見た目の期間と違う数を出してしまう
// - ボタンを押せない理由（ターンが進行中・雑談中。「解くべき論点」への回答）
//
// **`usageReview.kind === "result"` もこの区画では「ふだん」と同じ形で描く**——結果の札
// （別タスクで足す予定）はまだ無いので、結果が届いた直後は「前回の提案」のリンクが最新の日付を
// 指す「ふだん」に見える。あとから `kind === "result"` を分けて結果の札を描くだけで済む形に
// してある。

import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import {
  readTokenUsageSummary,
  TOKEN_USAGE_DAYS_CHOICES,
  TOKEN_USAGE_DAYS_QUERY_NAME,
  TOKEN_USAGE_SUMMARY_PATH,
  type TokenUsageDays,
  type TokenUsageSummary,
} from "../../../../shared/token-usage-summary.ts"
import {
  USAGE_REVIEW_REQUEST_TEXT,
  USAGE_REVIEW_STAGE_LABELS,
  USAGE_REVIEW_STAGES,
  type PreviousUsageReview,
  type UsageReviewStage,
} from "../../../../shared/usage-review.ts"
import { characterFaceInfo, type CharacterFaceInfo } from "../../../domain/character-face.ts"
import { formatElapsed } from "../../../domain/elapsed-time.ts"
import { sessionTokenUrl } from "../../../lib/session-token-url.ts"
import { useSessionDispatch, useSessionSelector, useTurnRunning } from "../../../stores/session.tsx"
import { localTimeZoneId, nowEpochMilliseconds, zonedDateTime } from "../../../utils/clock.ts"
import { formatCount, totalUsage } from "../usage-format.ts"

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

export type UseUsageReviewResult = {
  /** キャラクターの顔（`<CharacterFace>`。ふだん・見直し中の両方に出す）。 */
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
)

export function useUsageReview(): UseUsageReviewResult {
  const dispatch = useSessionDispatch()
  const turnRunning = useTurnRunning()
  const chatMode = useSessionSelector((session) => session.state.chatMode)
  const usageReview = useSessionSelector((session) => session.state.usageReview)
  const previousUsageReview = useSessionSelector((session) => session.state.previousUsageReview)
  const character = useSessionSelector((session) => session.state.character)
  const speeches = useSessionSelector((session) => session.state.speeches)

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

  if (usageReview.kind === "running") {
    return {
      kind: "running",
      face,
      elapsedText: formatElapsed(Math.max(0, Math.floor((now - usageReview.startedAt) / 1000))),
      speech: latestSpeechView(speeches),
      onInterrupt: () => dispatch({ type: "interrupt" }),
      stages: stageViews(usageReview.stage, summary),
    }
  }

  return {
    kind: "idle",
    face,
    start: startAvailability(chatMode, turnRunning),
    onStart: () => dispatch({ type: "prompt", text: USAGE_REVIEW_REQUEST_TEXT, images: [] }),
    previousReview: previousReviewView(previousUsageReview),
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

function previousReviewView(previous: PreviousUsageReview): PreviousUsageReviewView {
  if (previous.kind === "none") {
    return { kind: "none" }
  }
  return {
    kind: "found",
    dateLabel: monthDayLabel(previous.reviewedAt),
    // 結果の札を描くタスクが、ここを「同じ札の形」の結果画面を開く配線に差し替える。
    // それまでは押しても何も起きない。
    onOpen: () => {},
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
 * 見直し中の段の右の数を引く集計。**見直しの画面が使う集計と同じ経路**
 * （`GET /token-usage?days=`）を、いまの期間の選択とは別に引く。
 */
function useReviewStageSummary(days: TokenUsageDays | undefined): TokenUsageSummary | undefined {
  const query = useQuery({
    queryKey: ["usage-review-stage-summary", days] as const,
    queryFn: async ({ queryKey: [, target] }) =>
      target === undefined ? undefined : await fetchTokenUsageSummary(target),
    enabled: days !== undefined,
    staleTime: 0,
  })
  return query.data
}

async function fetchTokenUsageSummary(days: TokenUsageDays): Promise<TokenUsageSummary> {
  const response = await fetch(
    sessionTokenUrl(TOKEN_USAGE_SUMMARY_PATH, { [TOKEN_USAGE_DAYS_QUERY_NAME]: String(days) }),
  )
  if (!response.ok) {
    throw new Error(String(response.status))
  }
  return readTokenUsageSummary(await response.json())
}

/** 「前回の提案（09-16）」の日付部分。この端末のローカルの日で読む。 */
function monthDayLabel(epochMilliseconds: number): string {
  const zoned = zonedDateTime(epochMilliseconds, localTimeZoneId())
  return `${String(zoned.month).padStart(2, "0")}-${String(zoned.day).padStart(2, "0")}`
}
