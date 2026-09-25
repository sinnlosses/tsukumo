// 成果の画面の器（docs/design.md 2章「機能の中を分ける」）。フックも算出も持たず、受け取った値を
// そのまま各区画へ配るだけ。並べる順は `docs/screen-design.md` 13.10「並べるもの」のとおり
// （日の切り替え → 日記の区画 → しおり → 小さな驚き → 灯りの暦）。

import { type ReactElement } from "react"

import { Heading } from "../../../components/ui/heading/heading.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import styles from "./achievement.module.css"
import { BookmarkSection } from "./components/bookmark-section/bookmark-section.tsx"
import { DaySwitch } from "./components/day-switch/day-switch.tsx"
import { DiaryBook } from "./components/diary-book/diary-book.tsx"
import { DiarySection } from "./components/diary-section/diary-section.tsx"
import { LanternCalendar } from "./components/lantern-calendar/lantern-calendar.tsx"
import { SurpriseSection } from "./components/surprise-section/surprise-section.tsx"
import { type AchievementCalendarView } from "./hooks/use-achievement-calendar.ts"
import { type UseAchievementResult } from "./hooks/use-achievement.ts"
import { type DiaryBookModel } from "./hooks/use-diary-book.ts"

const UNAVAILABLE_NOTE = "このディレクトリでは成果を数えられない（main が読めない）"

export type PresentationalAchievementProps = UseAchievementResult & {
  readonly calendar: AchievementCalendarView
  /** 日記の区画の「日記帳で読む」（13.10「並べるもの」2）。 */
  readonly onOpenDiaryBook: () => void
  readonly diaryBook: DiaryBookModel
}

export function PresentationalAchievement(props: PresentationalAchievementProps): ReactElement {
  if (props.view.kind === "unavailable") {
    return (
      <>
        <div className={styles["achievement"]}>
          <Heading level={1} size="heading" tone="ink" weight="normal" className="">
            成果
          </Heading>
          <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
            {UNAVAILABLE_NOTE}
          </Text>
        </div>
        <DiaryBook {...props.diaryBook} />
      </>
    )
  }

  const viewedDate = props.daySwitch.kind === "known" ? props.daySwitch.date : undefined

  return (
    <>
      <div className={styles["achievement"]}>
        <DaySwitch
          daySwitch={props.daySwitch}
          onPreviousDay={props.onPreviousDay}
          onNextDay={props.onNextDay}
          onToday={props.onToday}
        />
        <DiarySection
          view={props.view}
          isFetching={props.isFetching}
          writing={props.writing}
          portrait={props.diaryPortrait}
          reveal={props.diaryReveal}
          review={props.review}
          onOpenDiaryBook={props.onOpenDiaryBook}
        />
        {props.view.kind === "ready" ? (
          <BookmarkSection
            bookmark={
              props.view.diary.kind === "written" ? props.view.diary.diary.bookmark : undefined
            }
            writerName={props.diaryPortrait.name}
          />
        ) : null}
        {props.view.kind === "ready" ? (
          <SurpriseSection
            graduations={props.view.graduations}
            milestones={props.view.milestones}
          />
        ) : null}
        <LanternCalendar
          calendar={props.calendar}
          viewedDate={viewedDate}
          onSelectDate={props.onSelectDate}
        />
      </div>
      <DiaryBook {...props.diaryBook} />
    </>
  )
}
