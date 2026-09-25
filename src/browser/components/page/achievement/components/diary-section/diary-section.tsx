// 日記の区画（`docs/screen-design.md` 13.10「並べるもの」2、「ボタンを押せないとき・押したあと」、
// 「空の日・数えられないとき」）。立ち絵・頭の行・吹き出し・数の札2枚・振り返りのボタン（または
// 3段の進み）を持つ。

import { type ReactElement } from "react"

import { type AchievementDoneTasks } from "../../../../../../shared/achievement.ts"
import { DIARY_STAGES, type DiaryStage } from "../../../../../../shared/diary.ts"
import { Portrait } from "../../../../../components/domain/portrait.tsx"
import { Button } from "../../../../../components/ui/button/button.tsx"
import { Heading } from "../../../../../components/ui/heading/heading.tsx"
import { Text } from "../../../../../components/ui/text/text.tsx"
import { useReportReveal } from "../../../../../domain/reveal/use-report-reveal.ts"
import styles from "../../achievement.module.css"
import { type DiaryWriterPortrait } from "../../domain/diary-writer.ts"
import {
  type AchievementReviewButton,
  type AchievementView,
  type AchievementWriting,
} from "../../hooks/use-achievement.ts"

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
  /** 頭の行の「日記帳で読む」（13.10「並べるもの」2）。押すとこの日の見開きが開く。 */
  readonly onOpenDiaryBook: () => void
}

export function DiarySection(props: DiarySectionProps): ReactElement {
  if (props.view.kind === "failed") {
    return (
      <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
        成果を取れなかった。
      </Text>
    )
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
          <Controls writing={props.writing} review={props.review} />
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
      <Text
        element="span"
        size="label"
        tone="accent"
        weight="bold"
        className={styles["achievement-diary-name"] ?? ""}
      >
        {props.portrait.name}の日記
      </Text>
      {writing.kind === "writing" ? (
        <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
          いま書いています…
        </Text>
      ) : latest !== undefined ? (
        <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
          振り返り [{timeLabel(latest.writtenAt)}]
        </Text>
      ) : null}
      {latest === undefined ? null : (
        <Button
          type="button"
          variant="link"
          size="label"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["achievement-diary-open-book"] ?? ""}
          onClick={props.onOpenDiaryBook}
        >
          日記帳で読む
        </Button>
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
        {latest === undefined ? null : (
          <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
            {latest.body}
          </Text>
        )}
      </div>
    )
  }

  if (writing.kind === "failed") {
    return (
      <div className={styles["achievement-diary-bubble-empty"]}>
        <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
          {WRITE_FAILED_NOTE}
        </Text>
        {latest === undefined ? null : (
          <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
            {latest.body}
          </Text>
        )}
      </div>
    )
  }

  if (isEmptyDay(view.commitCount, view.doneTasks)) {
    return (
      <div className={styles["achievement-diary-bubble-empty"]}>
        <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
          {EMPTY_DAY_NOTE}
        </Text>
      </div>
    )
  }

  if (latest === undefined) {
    return (
      <div className={styles["achievement-diary-bubble-empty"]}>
        <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
          {NO_DIARY_NOTE}
        </Text>
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
      <Text element="p" size="body" tone="ink" weight="inherit" className="">
        {props.body}
      </Text>
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
      <Heading level={3} size="label" tone="ink-quiet" weight="normal" className="">
        {props.label}
      </Heading>
      <Text
        element="p"
        size="heading"
        tone="ink"
        weight="inherit"
        className={styles["achievement-card-value"] ?? ""}
      >
        {props.value}
      </Text>
      {props.note === "" ? null : (
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["achievement-card-note"] ?? ""}
        >
          {props.note}
        </Text>
      )}
    </section>
  )
}

/** 振り返りのボタン、または進行中の「振り返り中…」（呼ぶのは `view.kind === "ready"` のときだけ。
 * `DiarySection` 参照）。**会話の画面へ移る口は置かない**（振り返りは会話の画面に何も出さない。
 * 13.10「ボタンを押せないとき・押したあと」）。 */
function Controls(props: {
  readonly writing: AchievementWriting
  readonly review: AchievementReviewButton
}): ReactElement {
  if (props.writing.kind === "writing") {
    return (
      <div className={styles["achievement-review"]}>
        <Button
          type="button"
          variant="outline-accent"
          size="secondary"
          pressed="none"
          disabled={true}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["achievement-review-button"] ?? ""}
          onClick={() => {}}
        >
          <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
            振り返り中…
          </Text>
        </Button>
      </div>
    )
  }

  const { review } = props

  return (
    <div className={styles["achievement-review"]}>
      <Button
        type="button"
        variant="outline-accent"
        size="secondary"
        pressed="none"
        disabled={review.availability.kind === "blocked"}
        ariaLabel={undefined}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["achievement-review-button"] ?? ""}
        onClick={review.onReview}
      >
        <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
          {review.label}
        </Text>
      </Button>
      {review.availability.kind === "blocked" && review.availability.reason !== "" ? (
        <Text element="p" size="secondary" tone="ink-quiet" weight="inherit" className="">
          {review.availability.reason}
        </Text>
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
