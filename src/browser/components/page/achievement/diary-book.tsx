// つくもの日記帳の見開き（`<DiaryBook>`。`docs/screen-design.md` 13.10「日記帳の見開き」）。
// `hooks/use-diary-book.ts` が畳んだ値をそのまま並べるだけの部品。呼ぶフックは、右ページの本文を
// 測って縮める `hooks/use-fit-diary-page.ts` だけ（外の世界に触るフックだけを外へ出す形。
// `docs/design.md` 2章「機能の中を分ける」）。
//
// **`<Dialog>` は開閉に関わらず常に描画し、中身だけ `open` で出し分ける**（`speech-log.tsx` と
// 同じ形）。開閉・Esc・backdrop のクリックは `components/ui/dialog/dialog.tsx` が持つ。

import { useRef, type ReactElement } from "react"

import { Portrait } from "../../../components/domain/portrait.tsx"
import { Button } from "../../../components/ui/button/button.tsx"
import { Dialog } from "../../../components/ui/dialog/dialog.tsx"
import { HStack } from "../../../components/ui/h-stack/h-stack.tsx"
import { Heading } from "../../../components/ui/heading/heading.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import { VStack } from "../../../components/ui/v-stack/v-stack.tsx"
import styles from "./achievement.module.css"
import { type AchievementReviewButton } from "./hooks/use-achievement.ts"
import {
  type DiaryBookBadge,
  type DiaryBookBookmark,
  type DiaryBookModel,
  type DiaryBookPage,
  type DiaryBookTaskList,
  type DiaryBookTocMonth,
} from "./hooks/use-diary-book.ts"
import { useFitDiaryPage } from "./hooks/use-fit-diary-page.ts"
import { Lamp } from "./lantern-calendar.tsx"

const TITLE = "つくもの日記帳"
const CLOSE_LABEL = "閉じる"
const TOC_LABEL = "目次"
const PREVIOUS_LABEL = "前の日"
const NEXT_LABEL = "次の日"
const BOOKMARK_HEADING = "しおり ── この日のいちばん"
const DONE_HEADING = "この日に終えたこと"
const UNKNOWN_TASKS_NOTE = "タスクの記録が無い"
const BLANK_BODY = "このページは、まだ白紙。"
const LOADING_NOTE = "…"
const FAILED_NOTE = "成果を取れなかった。"
const GRADUATION_LABEL = "卒業"

export function DiaryBook({
  open,
  openNote,
  page,
  previous,
  next,
  toc,
  onPrevious,
  onNext,
  onToggleToc,
  onSelectTocDate,
  onClose,
}: DiaryBookModel): ReactElement {
  return (
    <Dialog
      open={open}
      name={{ kind: "label", label: dialogLabel(page) }}
      backdrop="deep"
      placement={{ kind: "auto" }}
      onClose={onClose}
      className={styles["diary-book"] ?? ""}
    >
      {open ? (
        <VStack
          element="div"
          name={{ kind: "none" }}
          ref={undefined}
          gap="lg"
          align="stretch"
          justify="start"
          wrap="nowrap"
          className={styles["diary-book-stage"] ?? ""}
        >
          <HStack
            element="div"
            name={{ kind: "none" }}
            ref={undefined}
            gap="md"
            align="center"
            justify="start"
            wrap="wrap"
            className=""
          >
            <span className={styles["diary-book-title"]}>{TITLE}</span>
            <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
              {openNote}
            </Text>
            <div className={styles["diary-book-topbar-spacer"]} />
            <NavButton label={previous?.label} fallback={PREVIOUS_LABEL} onClick={onPrevious} />
            <NavButton label={next?.label} fallback={NEXT_LABEL} onClick={onNext} reverse />
            <Button
              type="button"
              variant="outline"
              size="secondary"
              pressed="none"
              disabled={false}
              ariaLabel={undefined}
              ariaHasPopup={undefined}
              title={undefined}
              className={styles["diary-book-topbar-button"] ?? ""}
              onClick={onToggleToc}
            >
              {TOC_LABEL}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="secondary"
              pressed="none"
              disabled={false}
              ariaLabel={undefined}
              ariaHasPopup={undefined}
              title={undefined}
              className={styles["diary-book-topbar-button"] ?? ""}
              onClick={onClose}
            >
              {CLOSE_LABEL}
            </Button>
          </HStack>
          <div className={styles["diary-book-spread"]}>
            <Spread page={page} />
          </div>
          {toc.open ? <Toc months={toc.months} onSelect={onSelectTocDate} /> : null}
        </VStack>
      ) : null}
    </Dialog>
  )
}

function NavButton(props: {
  readonly label: string | undefined
  readonly fallback: string
  readonly onClick: () => void
  readonly reverse?: boolean
}): ReactElement {
  const disabled = props.label === undefined
  const text = props.label ?? props.fallback
  return (
    <Button
      type="button"
      variant="outline"
      size="secondary"
      pressed="none"
      disabled={disabled}
      ariaLabel={undefined}
      ariaHasPopup={undefined}
      title={undefined}
      className={styles["diary-book-topbar-button"] ?? ""}
      onClick={props.onClick}
    >
      {props.reverse ? (
        <>
          {text}
          {" ›"}
        </>
      ) : (
        <>
          {"‹ "}
          {text}
        </>
      )}
    </Button>
  )
}

function Spread(props: { readonly page: DiaryBookPage }): ReactElement {
  const { page } = props
  if (page.kind === "loading") {
    return (
      <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
        {LOADING_NOTE}
      </Text>
    )
  }
  if (page.kind === "failed") {
    return (
      <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
        {FAILED_NOTE}
      </Text>
    )
  }
  return (
    <>
      <LeftPage page={page} />
      <div className={styles["diary-book-gutter"]} />
      <RightPage page={page} />
    </>
  )
}

function LeftPage(props: {
  readonly page: Extract<DiaryBookPage, { readonly kind: "ready" }>
}): ReactElement {
  const { page } = props
  return (
    <div className={styles["diary-book-left"]}>
      <Bookmark bookmark={page.bookmark} writerName={page.portraitName} />
      <TaskListing tasks={page.tasks} />
      {page.badges.length > 0 ? <Badges badges={page.badges} /> : null}
    </div>
  )
}

function Bookmark(props: {
  readonly bookmark: DiaryBookBookmark
  readonly writerName: string
}): ReactElement | null {
  const { bookmark } = props
  if (bookmark.kind === "none") {
    return null
  }
  return (
    <div className={styles["diary-book-bookmark"]}>
      <span className={styles["diary-book-ribbon"]} data-state={bookmark.kind} aria-hidden="true" />
      <p className={styles["diary-book-bookmark-heading"]}>{BOOKMARK_HEADING}</p>
      {bookmark.kind === "pending" ? (
        <p className={styles["diary-book-bookmark-pending"]}>
          振り返りのあとに、{props.writerName}が挟みます。
        </p>
      ) : (
        <>
          <p className={styles["diary-book-bookmark-task"]}>
            <span className={styles["diary-book-bookmark-task-id"]}>{bookmark.taskId}</span>
            {bookmark.summary}
          </p>
          <p className={styles["diary-book-bookmark-reason"]}>「{bookmark.reason}」</p>
        </>
      )}
    </div>
  )
}

function TaskListing(props: { readonly tasks: DiaryBookTaskList }): ReactElement {
  const { tasks } = props
  return (
    <div className={styles["diary-book-tasks"]}>
      <p className={styles["diary-book-tasks-heading"]}>{DONE_HEADING}</p>
      {tasks.tasksKnown ? (
        <ul className={styles["diary-book-task-list"]}>
          {tasks.items.map((task) => (
            <li key={task.id} className={styles["diary-book-task-row"]}>
              <span className={styles["diary-book-task-id"]}>{task.id}</span>
              <span className={styles["diary-book-task-summary"]}>{task.summary}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
          {UNKNOWN_TASKS_NOTE}
        </Text>
      )}
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["diary-book-tasks-footer"] ?? ""}
      >
        {tasks.moreCount > 0
          ? `ほか ${String(tasks.moreCount)} 件 · コミット ${String(tasks.commitCount)}`
          : `コミット ${String(tasks.commitCount)}`}
      </Text>
    </div>
  )
}

function Badges(props: { readonly badges: readonly DiaryBookBadge[] }): ReactElement {
  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      ref={undefined}
      gap="md"
      align="stretch"
      justify="start"
      wrap="wrap"
      className={styles["diary-book-badges"] ?? ""}
    >
      {props.badges.map((badge) => (
        <div key={badge.key} className={styles["diary-book-badge"]}>
          {badge.kind === "graduation" ? (
            <>
              <span className={styles["diary-book-badge-title"]}>{GRADUATION_LABEL}</span>
              <span className={styles["diary-book-badge-sub"]}>{badge.taskId}</span>
            </>
          ) : (
            <>
              <span className={styles["diary-book-badge-title"]}>{badge.countLabel}</span>
              <span className={styles["diary-book-badge-sub"]}>{badge.unitLabel}</span>
            </>
          )}
        </div>
      ))}
    </HStack>
  )
}

function RightPage(props: {
  readonly page: Extract<DiaryBookPage, { readonly kind: "ready" }>
}): ReactElement {
  const { page } = props
  const pageRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useFitDiaryPage(pageRef, bodyRef)
  return (
    <div ref={pageRef} className={styles["diary-book-right"]}>
      <div className={styles["diary-book-date-head"]}>
        <span className={styles["diary-book-kanji-date"]}>{page.kanjiDate}</span>
        <span className={styles["diary-book-weekday"]}>{page.weekday}</span>
        <span className={styles["diary-book-lamp"]}>
          <Lamp level={page.lampLevel} />
          {page.lampLabel}
        </span>
      </div>
      {page.right.kind === "written" ? (
        <div ref={bodyRef} className={styles["diary-book-body"]}>
          {page.right.paragraphs.map((paragraph) => (
            <p key={paragraph.key} className={styles["diary-book-paragraph"]}>
              {paragraph.timeLabel === undefined ? null : (
                <span className={styles["diary-book-paragraph-time"]}>{paragraph.timeLabel}</span>
              )}
              {paragraph.body}
            </p>
          ))}
        </div>
      ) : (
        <div ref={bodyRef} className={styles["diary-book-blank-body"]}>
          {BLANK_BODY}
        </div>
      )}
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="lg"
        align="end"
        justify="start"
        wrap="nowrap"
        className={styles["diary-book-signature"] ?? ""}
      >
        {page.right.kind === "blank" ? (
          <BlankReview review={page.right.review} writerName={page.portraitName} />
        ) : null}
        <div className={styles["diary-book-signature-portrait"]}>
          {page.portrait.portraitUrl === undefined ? null : (
            <Portrait
              url={page.portrait.portraitUrl}
              accent={page.portrait.accent}
              altText={page.portrait.altText}
              expression="default"
              outfit="default"
              motion={undefined}
              className={styles["diary-book-signature-image"]}
            />
          )}
          <span className={styles["diary-book-signature-name"]}>{page.portraitName}</span>
        </div>
      </HStack>
    </div>
  )
}

function BlankReview(props: {
  readonly review: AchievementReviewButton
  readonly writerName: string
}): ReactElement {
  const { review } = props
  return (
    <div className={styles["diary-book-review"]}>
      <Button
        type="button"
        variant="solid-accent"
        size="body"
        pressed="none"
        disabled={review.availability.kind === "blocked"}
        ariaLabel={undefined}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["diary-book-review-button"] ?? ""}
        onClick={review.onReview}
      >
        <Text element="span" size="inherit" tone="inherit" weight="bold" className="">
          {review.label}
        </Text>
      </Button>
      {review.availability.kind === "blocked" && review.availability.reason !== "" ? (
        <Text
          element="p"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["diary-book-review-note"] ?? ""}
        >
          {review.availability.reason}
        </Text>
      ) : (
        <Text
          element="p"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["diary-book-review-note"] ?? ""}
        >
          {props.writerName}がこのページに日記を書きます
        </Text>
      )}
    </div>
  )
}

function Toc(props: {
  readonly months: readonly DiaryBookTocMonth[]
  readonly onSelect: (date: string) => void
}): ReactElement {
  return (
    <div className={styles["diary-book-toc"]} role="dialog" aria-label={TOC_LABEL}>
      {props.months.length === 0 ? (
        <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
          まだ日記が無い。
        </Text>
      ) : (
        props.months.map((month) => (
          <section key={month.heading} className={styles["diary-book-toc-month"]}>
            <Heading
              level={3}
              size="subheading"
              tone="ink"
              weight="bold"
              className={styles["diary-book-toc-heading"] ?? ""}
            >
              {month.heading}
            </Heading>
            <ul className={styles["diary-book-toc-list"]}>
              {month.days.map((day) => (
                <li key={day.date}>
                  <button
                    type="button"
                    className={styles["diary-book-toc-day"]}
                    onClick={() => {
                      props.onSelect(day.date)
                    }}
                  >
                    {day.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

function dialogLabel(page: DiaryBookPage): string {
  if (page.kind !== "ready") {
    return TITLE
  }
  return page.right.kind === "written"
    ? `${page.kanjiDate}の日記`
    : `${page.kanjiDate}のページ（まだ白紙）`
}
