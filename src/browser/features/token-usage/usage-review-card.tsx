// 「減らし方を見てもらう」区画（ふだん・見直し中）。トークン消費の画面の、題の帯といまの
// コンテキストの札のあいだに置く（見本は `docs/history/mockup/` の
// `token-advice-idle-*.html` / `token-advice-running-*.html`）。取得・畳み込みは
// `hooks/use-usage-review.ts`、ここは受け取った形をそのまま置く器
// （docs/design.md 2章「機能の中を分ける」）。
//
// **段の印は `screen-nav-current-work.tsx` と同じ文字**（済 = ✓、進行中は回る「…」、未着手は
// ○）。SVG を増やさず、帯の「いまの作業」の一覧と同じ読み方に揃える。

import { type ReactElement } from "react"

import { CharacterFace } from "../../components/character-face.tsx"
import {
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

export type UsageReviewCardProps = {
  readonly review: UseUsageReviewResult
}

export function UsageReviewCard(props: UsageReviewCardProps): ReactElement {
  const { review } = props

  if (review.kind === "running") {
    return <RunningReviewCard review={review} />
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
      <div className={styles["usage-review-body"]}>
        <span className={styles["usage-review-heading"]}>{IDLE_HEADING}</span>
        <span className={styles["usage-review-note"]}>{IDLE_NOTE}</span>
      </div>
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
        <div className={styles["usage-review-body"]}>
          <span className={styles["usage-review-heading"]}>{RUNNING_HEADING}</span>
          {review.speech.kind === "said" ? (
            <span className={styles["usage-review-speech"]}>{`「${review.speech.text}」`}</span>
          ) : null}
        </div>
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
