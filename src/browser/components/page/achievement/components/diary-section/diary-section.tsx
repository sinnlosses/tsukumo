// 日記の区画。
// 立ち絵・頭の行・吹き出し・数の札2枚・振り返りのボタン（または3段の進み）を持つ。

import clsx from "clsx"
import type { ReactElement } from "react"

import { DIARY_STAGES, type DiaryStage } from "../../../../../../shared/diary/diary.ts"
import { useReportReveal } from "../../../../../domain/reveal/use-report-reveal.ts"
import { Portrait } from "../../../../domain/portrait.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import type { DiaryWriterPortrait } from "../../domain/diary-writer.ts"
import type {
  AchievementReviewButton,
  AchievementWriting,
  DiarySectionBubble,
  DiarySectionCard,
  DiarySectionModel,
} from "../../hooks/use-achievement.ts"
import styles from "./diary-section.module.css"

const STAGE_LABEL: Readonly<Record<DiaryStage, string>> = {
  read: "この日のタスクを読む",
  write: "日記を書く",
  pick: "いちばんを選ぶ",
}

export type DiarySectionProps = {
  readonly diary: DiarySectionModel
  readonly isFetching: boolean
  readonly writing: AchievementWriting
  readonly portrait: DiaryWriterPortrait
  readonly reveal: boolean
  /** 書き上げの演出を見せる側に立ったときに呼ぶ。 */
  readonly onRevealed: () => void
  readonly review: AchievementReviewButton
  /** 頭の行の「日記帳で読む」。押すとこの日の見開きが開く。 */
  readonly onOpenDiaryBook: () => void
}

export function DiarySection(props: DiarySectionProps): ReactElement {
  const { diary } = props
  if (diary.kind === "failed") {
    return (
      <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
        成果を取れなかった。
      </Text>
    )
  }

  return (
    <section
      aria-label="この日の日記"
      className={clsx(styles["achievement-diary"], props.isFetching && styles["is-fetching"])}
    >
      {props.portrait.portrait.portraitUrl !== undefined && (
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
          diary={diary}
          writing={props.writing}
          onOpenDiaryBook={props.onOpenDiaryBook}
        />
        <Bubble bubble={diary.bubble} reveal={props.reveal} onRevealed={props.onRevealed} />
        {props.writing.kind === "writing" && <Progress stage={props.writing.stage} />}
        <Cards cards={diary.cards} />
        {diary.ready && <Controls writing={props.writing} review={props.review} />}
      </div>
    </section>
  )
}

function Header(props: {
  readonly portrait: DiaryWriterPortrait
  readonly diary: Extract<DiarySectionModel, { readonly kind: "shown" }>
  readonly writing: AchievementWriting
  readonly onOpenDiaryBook: () => void
}): ReactElement {
  const { diary, writing } = props

  return (
    <div className={styles["achievement-diary-header"]}>
      <Text
        element="span"
        size="label"
        tone="accent"
        weight="bold"
        className={styles["achievement-diary-name"]}
      >
        {props.portrait.name}の日記
      </Text>
      {writing.kind === "writing" ? (
        <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
          いま書いています…
        </Text>
      ) : (
        diary.reviewedLabel.kind === "shown" && (
          <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
            {diary.reviewedLabel.label}
          </Text>
        )
      )}
      {diary.canOpenBook && (
        <Button
          variant="link"
          size="label"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["achievement-diary-open-book"]}
          onClick={props.onOpenDiaryBook}
        >
          日記帳で読む
        </Button>
      )}
    </div>
  )
}

function Bubble(props: {
  readonly bubble: DiarySectionBubble
  readonly reveal: boolean
  readonly onRevealed: () => void
}): ReactElement {
  const { bubble } = props

  if (bubble.kind === "blank") {
    return <div className={styles["achievement-diary-bubble-empty"]} />
  }

  if (bubble.kind === "notes") {
    return (
      <div className={styles["achievement-diary-bubble-empty"]}>
        {bubble.notes.map((note) => (
          <Text key={note} element="p" size="body" tone="ink-quiet" weight="inherit" className="">
            {note}
          </Text>
        ))}
      </div>
    )
  }

  return (
    <WrittenBubble
      key={bubble.key}
      body={bubble.body}
      reveal={props.reveal}
      onRevealed={props.onRevealed}
      revisionId={bubble.revisionId}
    />
  )
}

function WrittenBubble(props: {
  readonly body: string
  readonly reveal: boolean
  readonly onRevealed: () => void
  readonly revisionId: number
}): ReactElement {
  const rootRef = useReportReveal(props.reveal, props.revisionId, props.onRevealed)
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

function Cards(props: { readonly cards: readonly DiarySectionCard[] }): ReactElement {
  return (
    <div className={styles["achievement-cards"]}>
      {props.cards.map((card) => (
        <Card key={card.key} label={card.label} value={card.value} note={card.note} />
      ))}
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
        className={styles["achievement-card-value"]}
      >
        {props.value}
      </Text>
      {props.note !== "" && (
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["achievement-card-note"]}
        >
          {props.note}
        </Text>
      )}
    </section>
  )
}

/**
 * 振り返りのボタン、または進行中の「振り返り中…」。
 * 呼ぶのは `view.kind === "ready"` のときだけ。
 * 振り返りは会話の画面に何も出さないので、会話の画面へ移る口は置かない。
 */
function Controls(props: {
  readonly writing: AchievementWriting
  readonly review: AchievementReviewButton
}): ReactElement {
  if (props.writing.kind === "writing") {
    return (
      <div className={styles["achievement-review"]}>
        <Button
          variant="outline-accent"
          size="secondary"
          pressed="none"
          disabled={true}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["achievement-review-button"]}
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
        variant="outline-accent"
        size="secondary"
        pressed="none"
        disabled={review.availability.kind === "blocked"}
        ariaLabel={undefined}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["achievement-review-button"]}
        onClick={review.onReview}
      >
        <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
          {review.label}
        </Text>
      </Button>
      {review.availability.kind === "blocked" && review.availability.reason !== "" && (
        <Text element="p" size="secondary" tone="ink-quiet" weight="inherit" className="">
          {review.availability.reason}
        </Text>
      )}
    </div>
  )
}
