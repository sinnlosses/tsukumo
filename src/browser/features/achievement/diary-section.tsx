// 日記の区画（`docs/screen-design.md` 13.10「並べるもの」2、「ボタンを押せないとき・押したあと」、
// 「空の日・数えられないとき」）。立ち絵・頭の行・吹き出し・数の札2枚・振り返りのボタン（または
// 3段の進み）を持つ。

import { type ReactElement } from "react"

import { type AchievementDoneTasks } from "../../../shared/achievement.ts"
import { DIARY_STAGES, type DiaryStage } from "../../../shared/diary.ts"
import { Portrait } from "../../components/portrait.tsx"
import { useReportReveal } from "../../domain/reveal/use-report-reveal.ts"
import styles from "./achievement.module.css"
import { type DiaryWriterPortrait } from "./diary-writer.ts"
import {
  type AchievementReviewButton,
  type AchievementView,
  type AchievementWriting,
} from "./hooks/use-achievement.ts"

const EMPTY_DAY_NOTE = "この日に main へ入った成果は無い。"
const NO_DIARY_NOTE = "まだこの日の日記は無い。"
const WRITE_FAILED_NOTE = "日記を書けなかった。もう一度押すと書き直す。"
const UNKNOWN_TASKS_NOTE = "タスクの記録が無い"
const LOADING_VALUE = "…"
const UNKNOWN_VALUE = "—"

const STAGE_LABEL: Readonly<Record<DiaryStage, string>> = {
  read: "この日のタスクを読む",
  write: "日記を書く",
  pick: "いちばんを選ぶ",
}

export type DiarySectionProps = {
  readonly view: Exclude<AchievementView, { readonly kind: "unavailable" }>
  readonly isFetching: boolean
  readonly writing: AchievementWriting
  readonly portrait: DiaryWriterPortrait
  readonly reveal: boolean
  readonly review: AchievementReviewButton
  readonly onWatchConversation: () => void
  /** 頭の行の「日記帳で読む」（13.10「並べるもの」2）。押すとこの日の見開きが開く。 */
  readonly onOpenDiaryBook: () => void
}

export function DiarySection(props: DiarySectionProps): ReactElement {
  if (props.view.kind === "failed") {
    return <p className={styles["achievement-note"]}>成果を取れなかった。</p>
  }

  const dimmed = props.isFetching ? ` ${styles["is-fetching"] ?? ""}` : ""

  return (
    <section aria-label="この日の日記" className={`${styles["achievement-diary"] ?? ""}${dimmed}`}>
      {props.portrait.portrait.portraitUrl === undefined ? null : (
        <Portrait
          url={props.portrait.portrait.portraitUrl}
          accent={props.portrait.portrait.accent}
          altText={props.portrait.portrait.altText}
          expression="default"
          outfit="default"
          motion={undefined}
          className={styles["achievement-diary-portrait"]}
        />
      )}
      <div className={styles["achievement-diary-body"]}>
        <Header
          portrait={props.portrait}
          view={props.view}
          writing={props.writing}
          onOpenDiaryBook={props.onOpenDiaryBook}
        />
        <Bubble view={props.view} writing={props.writing} reveal={props.reveal} />
        {props.writing.kind === "writing" ? <Progress stage={props.writing.stage} /> : null}
        {props.view.kind === "ready" ? (
          <Cards doneTasks={props.view.doneTasks} commitCount={props.view.commitCount} />
        ) : (
          <Cards doneTasks={undefined} commitCount={undefined} />
        )}
        {props.view.kind === "ready" ? (
          <Controls
            writing={props.writing}
            review={props.review}
            onWatchConversation={props.onWatchConversation}
          />
        ) : null}
      </div>
    </section>
  )
}

function Header(props: {
  readonly portrait: DiaryWriterPortrait
  readonly view: Exclude<AchievementView, { readonly kind: "unavailable" }>
  readonly writing: AchievementWriting
  readonly onOpenDiaryBook: () => void
}): ReactElement {
  const { view, writing } = props
  const written =
    view.kind === "ready" && view.diary.kind === "written" ? view.diary.diary : undefined
  const latest = written?.paragraphs.at(-1)

  return (
    <div className={styles["achievement-diary-header"]}>
      <span className={styles["achievement-diary-name"]}>{props.portrait.name}の日記</span>
      {writing.kind === "writing" ? (
        <span className={styles["achievement-diary-status"]}>いま書いています…</span>
      ) : latest !== undefined ? (
        <span className={styles["achievement-diary-status"]}>
          振り返り [{timeLabel(latest.writtenAt)}]
        </span>
      ) : null}
      {latest === undefined ? null : (
        <button
          type="button"
          className={styles["achievement-diary-open-book"]}
          onClick={props.onOpenDiaryBook}
        >
          日記帳で読む
        </button>
      )}
    </div>
  )
}

function Bubble(props: {
  readonly view: Exclude<AchievementView, { readonly kind: "unavailable" }>
  readonly writing: AchievementWriting
  readonly reveal: boolean
}): ReactElement {
  const { view, writing } = props

  if (view.kind !== "ready") {
    return <div className={styles["achievement-diary-bubble-empty"]} />
  }

  const written = view.diary.kind === "written" ? view.diary.diary : undefined
  const latest = written?.paragraphs.at(-1)

  if (writing.kind === "writing") {
    return (
      <div className={styles["achievement-diary-bubble-empty"]}>
        {latest === undefined ? null : <p>{latest.body}</p>}
      </div>
    )
  }

  if (writing.kind === "failed") {
    return (
      <div className={styles["achievement-diary-bubble-empty"]}>
        <p className={styles["achievement-note"]}>{WRITE_FAILED_NOTE}</p>
        {latest === undefined ? null : <p>{latest.body}</p>}
      </div>
    )
  }

  if (isEmptyDay(view.commitCount, view.doneTasks)) {
    return (
      <div className={styles["achievement-diary-bubble-empty"]}>
        <p className={styles["achievement-note"]}>{EMPTY_DAY_NOTE}</p>
      </div>
    )
  }

  if (latest === undefined) {
    return (
      <div className={styles["achievement-diary-bubble-empty"]}>
        <p className={styles["achievement-note"]}>{NO_DIARY_NOTE}</p>
      </div>
    )
  }

  return (
    <WrittenBubble
      key={`${written?.date ?? ""}-${latest.writtenAt}`}
      body={latest.body}
      reveal={props.reveal}
      revisionId={written?.paragraphs.length ?? 0}
    />
  )
}

function WrittenBubble(props: {
  readonly body: string
  readonly reveal: boolean
  readonly revisionId: number
}): ReactElement {
  const rootRef = useReportReveal(props.reveal, props.revisionId)
  return (
    <div ref={rootRef} className={styles["achievement-diary-bubble"]}>
      <p>{props.body}</p>
    </div>
  )
}

function Progress(props: { readonly stage: DiaryStage }): ReactElement {
  const currentIndex = DIARY_STAGES.indexOf(props.stage)
  return (
    <ol className={styles["achievement-diary-progress"]}>
      {DIARY_STAGES.map((stage, index) => (
        <li
          key={stage}
          className={styles["achievement-diary-progress-item"]}
          data-state={
            index < currentIndex ? "done" : index === currentIndex ? "current" : "pending"
          }
        >
          {STAGE_LABEL[stage]}
        </li>
      ))}
    </ol>
  )
}

function Cards(props: {
  readonly doneTasks: AchievementDoneTasks | undefined
  readonly commitCount: number | undefined
}): ReactElement {
  const { doneTasks, commitCount } = props
  return (
    <div className={styles["achievement-cards"]}>
      <Card
        label="終えたタスク"
        value={
          doneTasks === undefined
            ? LOADING_VALUE
            : doneTasks.kind === "unknown"
              ? UNKNOWN_VALUE
              : String(doneTasks.items.length)
        }
        note={doneTasks?.kind === "unknown" ? UNKNOWN_TASKS_NOTE : ""}
      />
      <Card
        label="コミット"
        value={commitCount === undefined ? LOADING_VALUE : String(commitCount)}
        note=""
      />
    </div>
  )
}

function Card(props: {
  readonly label: string
  readonly value: string
  readonly note: string
}): ReactElement {
  return (
    <section className={styles["achievement-card"]}>
      <h3 className={styles["achievement-card-label"]}>{props.label}</h3>
      <p className={styles["achievement-card-value"]}>{props.value}</p>
      {props.note === "" ? null : <p className={styles["achievement-card-note"]}>{props.note}</p>}
    </section>
  )
}

/** 振り返りのボタン、または進行中の「振り返り中…」（呼ぶのは `view.kind === "ready"` のときだけ。
 * `DiarySection` 参照）。 */
function Controls(props: {
  readonly writing: AchievementWriting
  readonly review: AchievementReviewButton
  readonly onWatchConversation: () => void
}): ReactElement {
  if (props.writing.kind === "writing") {
    return (
      <div className={styles["achievement-review"]}>
        <button type="button" className={styles["achievement-review-button"]} aria-disabled="true">
          振り返り中…
        </button>
        <button
          type="button"
          className={styles["achievement-diary-watch"]}
          onClick={props.onWatchConversation}
        >
          会話の画面で様子を見る ›
        </button>
      </div>
    )
  }

  const { review } = props

  return (
    <div className={styles["achievement-review"]}>
      <button
        type="button"
        className={styles["achievement-review-button"]}
        aria-disabled={review.availability.kind === "blocked"}
        onClick={review.onReview}
      >
        {review.label}
      </button>
      {review.availability.kind === "blocked" && review.availability.reason !== "" ? (
        <p className={styles["achievement-review-note"]}>{review.availability.reason}</p>
      ) : null}
    </div>
  )
}

function isEmptyDay(commitCount: number, doneTasks: AchievementDoneTasks): boolean {
  return commitCount === 0 && doneTasks.kind === "known" && doneTasks.items.length === 0
}

/** 「21:40」の形。`writtenAt` は `local-time.ts` の `isoWithOffset`（オフセット付き ISO）で、
 * その場のローカル時刻を文字のまま持つので `Temporal` へ通さず素直に切り出す。 */
function timeLabel(writtenAt: string): string {
  const match = /T(\d{2}:\d{2})/.exec(writtenAt)
  return match?.[1] ?? ""
}
