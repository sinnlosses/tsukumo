// 「減らし方を見てもらう」区画（ふだん・見直し中・結果）。トークン消費の画面の、題の帯といまの
// コンテキストの札のあいだに置く（見本は `docs/history/mockup/` の
// `token-advice-idle-*.html` / `token-advice-running-*.html` / `token-advice-result-*.html`）。
// 取得・畳み込みは `hooks/use-usage-review.ts`、ここは受け取った形をそのまま置く器
// （docs/design.md 2章「機能の中を分ける」）。
//
// **段の印は `screen-nav-current-work.tsx` と同じ文字**（済 = ✓、進行中は回る「…」、未着手は
// ○）。SVG を増やさず、帯の「いまの作業」の一覧と同じ読み方に揃える。
//
// **結果の場面（`kind === "result"`）は、今回の結果でも「前回の提案」を開いたときでも同じ形**
// （`use-usage-review.ts` の `resultView` が組み立てを1つに揃えている）。効きめの札の色・主
// ボタンの文言は `docs/screen-design.md` 13.2「結果の場面」の決定どおり。

import { type ReactElement } from "react"

import {
  type UsageProposalFollowUp,
  type UsageProposalImpact,
} from "../../../../shared/usage-review.ts"
import { CharacterFace } from "../../../components/domain/character-face.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import { VStack } from "../../../components/ui/v-stack/v-stack.tsx"
import {
  type UsageReviewResultProposalView,
  type UsageReviewStageStatus,
  type UsageReviewStageView,
  type UseUsageReviewResult,
} from "./hooks/use-usage-review.ts"
import styles from "./token-usage.module.css"

const SECTION_LABEL = "減らし方を見てもらう"
const IDLE_HEADING = "tsukumo に減らし方を見てもらう"
const IDLE_NOTE =
  "直近の使い方（モデル・ツール・キャッシュ・コンテキスト）から、効きそうな見直しを挙げます。" +
  "見るだけで、設定は変えません。"
const START_LABEL = "減らし方を見てもらう"
const PREVIOUS_LABEL_PREFIX = "前回の提案"
const RUNNING_HEADING = "見直し中…"
const STOP_LABEL = "止める"
const CONTINUES_NOTE =
  "ほかの画面に移っても続きます。終わったらヘッダーとキャラの吹き出しで知らせます。"
const RETRY_LABEL = "もう一度見てもらう"
const CLOSE_LABEL = "閉じる"
const DISMISS_LABEL = "見送る"
const EMPTY_PROPOSALS_NOTE = "いま出せる提案は無い。"
const IMPACT_BADGE_LABEL = "効きめ"

/** 効きめの見出し文字（`docs/glossary.md`「提案」）。 */
const IMPACT_LABELS = {
  large: "大",
  medium: "中",
  small: "小",
} as const satisfies Record<UsageProposalImpact, string>

/** 主ボタンの文言（`docs/design.md`「見直しのツールと状態」——押す口は2つに固定）。 */
const FOLLOW_UP_LABELS = {
  delegate: "tsukumo に頼む",
  task: "タスクにする",
} as const satisfies Record<UsageProposalFollowUp, string>

export type UsageReviewCardProps = {
  readonly review: UseUsageReviewResult
}

export function UsageReviewCard(props: UsageReviewCardProps): ReactElement {
  const { review } = props

  if (review.kind === "running") {
    return <RunningReviewCard review={review} />
  }
  if (review.kind === "result") {
    return <ResultReviewCard review={review} />
  }
  return <IdleReviewCard review={review} />
}

function IdleReviewCard(props: {
  readonly review: Extract<UseUsageReviewResult, { readonly kind: "idle" }>
}): ReactElement {
  const { review } = props

  return (
    <section
      aria-label={SECTION_LABEL}
      className={`${styles["usage-review"]} ${styles["usage-review-invite"]}`}
    >
      <CharacterFace
        url={review.face.url}
        alt={review.face.alt}
        className={styles["usage-review-face"] ?? ""}
      />
      <VStack
        element="div"
        gap="xs"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["usage-review-body"] ?? ""}
      >
        <span className={styles["usage-review-heading"]}>{IDLE_HEADING}</span>
        <span className={styles["usage-review-note"]}>{IDLE_NOTE}</span>
      </VStack>
      <div className={styles["usage-review-actions"]}>
        <button
          type="button"
          className={styles["usage-review-start"]}
          disabled={review.start.kind === "blocked"}
          onClick={review.onStart}
        >
          {START_LABEL}
        </button>
        {review.start.kind === "blocked" ? (
          <p className={styles["usage-review-blocked"]}>{review.start.reason}</p>
        ) : null}
        {review.previousReview.kind === "found" ? (
          <button
            type="button"
            className={styles["usage-review-previous"]}
            onClick={review.previousReview.onOpen}
          >
            {`${PREVIOUS_LABEL_PREFIX}（${review.previousReview.dateLabel}）`}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function RunningReviewCard(props: {
  readonly review: Extract<UseUsageReviewResult, { readonly kind: "running" }>
}): ReactElement {
  const { review } = props
  const doneCount = review.stages.filter((stage) => stage.status === "done").length
  const progressPercent = ((doneCount + 0.5) / review.stages.length) * 100

  return (
    <section
      aria-label={SECTION_LABEL}
      aria-busy="true"
      className={`${styles["usage-review"]} ${styles["usage-review-running"]}`}
    >
      <div className={styles["usage-review-running-head"]}>
        <CharacterFace
          url={review.face.url}
          alt={review.face.alt}
          className={styles["usage-review-face"] ?? ""}
        />
        <VStack
          element="div"
          gap="xs"
          align="stretch"
          justify="start"
          wrap="nowrap"
          className={styles["usage-review-body"] ?? ""}
        >
          <span className={styles["usage-review-heading"]}>{RUNNING_HEADING}</span>
          {review.speech.kind === "said" ? (
            <span className={styles["usage-review-speech"]}>{`「${review.speech.text}」`}</span>
          ) : null}
        </VStack>
        <span className={styles["usage-review-elapsed"]}>{review.elapsedText}</span>
        <button type="button" className={styles["usage-review-stop"]} onClick={review.onInterrupt}>
          {STOP_LABEL}
        </button>
      </div>

      <div className={styles["usage-review-progress"]}>
        <div
          className={styles["usage-review-progress-fill"]}
          style={{ "--usage-review-progress": `${String(progressPercent)}%` }}
        />
      </div>

      <ul className={styles["usage-review-stages"]}>
        {review.stages.map((stage) => (
          <StageRow key={stage.stage} stage={stage} />
        ))}
      </ul>

      <span className={styles["usage-review-continues"]}>{CONTINUES_NOTE}</span>
    </section>
  )
}

function StageRow(props: { readonly stage: UsageReviewStageView }): ReactElement {
  const { stage } = props
  const classes = [
    styles["usage-review-stage"],
    stage.status === "done" ? styles["usage-review-stage-done"] : "",
    stage.status === "running" ? styles["usage-review-stage-running"] : "",
  ]
    .filter((name) => name !== "")
    .join(" ")

  return (
    <li className={classes}>
      <span className={styles["usage-review-stage-mark"]} aria-hidden="true">
        {stageMark(stage.status)}
      </span>
      <span className={styles["usage-review-stage-label"]}>{stage.label}</span>
      {stage.count.kind === "shown" ? (
        <span className={styles["usage-review-stage-count"]}>{stage.count.label}</span>
      ) : null}
    </li>
  )
}

function stageMark(status: UsageReviewStageStatus): string {
  if (status === "done") {
    return "✓"
  }
  return status === "running" ? "…" : "○"
}

function ResultReviewCard(props: {
  readonly review: Extract<UseUsageReviewResult, { readonly kind: "result" }>
}): ReactElement {
  const { review } = props
  const blockedReason = review.retry.kind === "blocked" ? review.retry.reason : undefined

  return (
    <section
      aria-label={SECTION_LABEL}
      className={`${styles["usage-review"]} ${styles["usage-review-result"] ?? ""}`}
    >
      <div className={styles["usage-review-result-head"]}>
        <CharacterFace
          url={review.face.url}
          alt={review.face.alt}
          className={styles["usage-review-face"] ?? ""}
        />
        <div className={styles["usage-review-result-bubble"]}>
          <Text
            element="span"
            size="label"
            tone="accent"
            weight="bold"
            className={styles["usage-review-result-bubble-label"] ?? ""}
          >
            tsukumo
          </Text>
          <p className={styles["usage-review-result-bubble-text"]}>{review.headline}</p>
        </div>
        <div className={styles["usage-review-result-meta"]}>
          <span
            className={styles["usage-review-result-timestamp"]}
          >{`${review.reviewedAtLabel} · ${review.periodLabel}`}</span>
          {review.close.kind === "shown" ? (
            <button
              type="button"
              className={styles["usage-review-result-close"]}
              onClick={review.close.onClose}
            >
              {CLOSE_LABEL}
            </button>
          ) : null}
          <button
            type="button"
            className={styles["usage-review-retry"]}
            disabled={review.retry.kind === "blocked"}
            onClick={review.onRetry}
          >
            {RETRY_LABEL}
          </button>
          {blockedReason === undefined ? null : (
            <p className={styles["usage-review-blocked"]}>{blockedReason}</p>
          )}
        </div>
      </div>

      {review.proposals.length === 0 ? (
        <p className={styles["usage-review-note"]}>{EMPTY_PROPOSALS_NOTE}</p>
      ) : (
        <div className={styles["usage-review-proposals"]}>
          {review.proposals.map((proposal) => (
            <ProposalCard
              key={proposal.key}
              proposal={proposal}
              disabled={blockedReason !== undefined}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ProposalCard(props: {
  readonly proposal: UsageReviewResultProposalView
  /** 主ボタンを押せないか（結果の場面の「もう一度見てもらう」と同じ理由。見送るは常に押せる）。 */
  readonly disabled: boolean
}): ReactElement {
  const { proposal, disabled } = props

  return (
    <article className={styles["usage-review-proposal"]}>
      <ImpactBadge impact={proposal.impact} />
      <div className={styles["usage-review-proposal-body"]}>
        <h3 className={styles["usage-review-proposal-title"]}>{proposal.title}</h3>
        <p className={styles["usage-review-proposal-basis"]}>
          <span className={styles["usage-review-proposal-note-label"]}>根拠：</span>
          {proposal.basis}
        </p>
        <p className={styles["usage-review-proposal-action"]}>
          <span className={styles["usage-review-proposal-note-label"]}>やること：</span>
          {proposal.action}
        </p>
      </div>
      <div className={styles["usage-review-proposal-actions"]}>
        <button
          type="button"
          className={styles["usage-review-proposal-primary"]}
          disabled={disabled}
          onClick={proposal.onPrimary}
        >
          {FOLLOW_UP_LABELS[proposal.followUp]}
        </button>
        <button
          type="button"
          className={styles["usage-review-proposal-dismiss"]}
          onClick={proposal.onDismiss}
        >
          {DISMISS_LABEL}
        </button>
      </div>
    </article>
  )
}

function ImpactBadge(props: { readonly impact: UsageProposalImpact }): ReactElement {
  const { impact } = props
  const toneClass = {
    large: styles["usage-review-impact-large"],
    medium: styles["usage-review-impact-medium"],
    small: styles["usage-review-impact-small"],
  } as const satisfies Record<UsageProposalImpact, string | undefined>

  return (
    <span className={`${styles["usage-review-impact"]} ${toneClass[impact] ?? ""}`}>
      <span className={styles["usage-review-impact-label"]}>{IMPACT_BADGE_LABEL}</span>
      <span className={styles["usage-review-impact-value"]}>{IMPACT_LABELS[impact]}</span>
    </span>
  )
}
