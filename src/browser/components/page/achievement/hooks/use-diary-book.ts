// つくもの日記帳の見開きのロジック。
// 開閉・開いている日・目次の開閉を保ち、開いている日の `achievement.day` を取り、見開きに並べる形へ畳む。
//
// 1日ぶんの取得は `useAchievement` と同じ手続きを、開いている日だけ別に引く（同じ日ならキャッシュを分け合う）。
// 前後の日・目次に並べる日は、暦の `diaryDates`（すべての日記のある日、新しい順）をそのまま使う。
// `diaryDates` は `listDiaryDates` がファイル名の一覧だけから作り中身を読まないので、目次にしおりのタスク ID は載せられない。
// 「日記帳で読む」から開いたときの添え書き「この日の日記から開きました」は正典に無い仮の文言。

import { skipToken, useQuery } from "@tanstack/react-query"
import { useState } from "react"

import {
  lampLevel,
  type LampLevel,
} from "../../../../../shared/achievement/achievement-calendar.ts"
import type {
  AchievementGraduation,
  AchievementMilestone,
  AchievementTask,
  DailyAchievement,
} from "../../../../../shared/achievement/achievement.ts"
import type {
  CharacterInfo,
  CharacterPackEntry,
} from "../../../../../shared/character-pack/character.ts"
import type { Diary, DiaryWriting } from "../../../../../shared/diary/diary.ts"
import type { PortraitAppearance } from "../../../../domain/portrait-appearance.ts"
import { rpc } from "../../../../domain/rpc.ts"
import { useSession, type SessionDispatch } from "../../../../stores/session.ts"
import { dayLabel } from "../../../../utils/day-label.ts"
import { monthDayLabel } from "../../../../utils/month-day-label.ts"
import { DIARY_BOOK_TITLE } from "../domain/diary-book-title.ts"
import { currentWriterPortraitOf } from "../domain/diary-writer.ts"
import { kanjiDateLabel, kanjiNumeral, kanjiWeekdayLabel } from "../domain/kanji-date.ts"
import { LAMP_LABEL } from "../domain/lamp-label.ts"
import { reviewAvailabilityOf } from "../domain/review-availability.ts"
import { writtenTimeOf } from "../domain/written-time.ts"
import type { AchievementCalendarView } from "./use-achievement-calendar.ts"
import type { AchievementDaySwitch, AchievementReviewButton } from "./use-achievement.ts"
import { takeDiaryBookOpenRequest, useDiaryBookOpenRequest } from "./use-diary-book-open-request.ts"

const BLANK_REVIEW_LABEL = "この日を振り返る"

/** 見開きを開いた口（頭の行の添え書きに出す）。`notice` は書き終わりの知らせの「日記帳で開く」。 */
export type DiaryBookOpenSource = "calendar" | "diary-section" | "notice"

const OPEN_NOTE = {
  calendar: "灯りの暦から開きました",
  "diary-section": "この日の日記から開きました",
  notice: "書き終わりの知らせから開きました",
} as const satisfies Record<DiaryBookOpenSource, string>

type BookState =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly source: DiaryBookOpenSource
      readonly date: string
      readonly tocOpen: boolean
    }

/** 左下に並べる丸い印（卒業・節目）。 */
export type DiaryBookBadge =
  | { readonly kind: "graduation"; readonly key: string; readonly taskId: string }
  | {
      readonly kind: "milestone"
      readonly key: string
      readonly countLabel: string
    }

/** 「この日に終えたこと」。 */
export type DiaryBookTaskList = {
  readonly items: readonly AchievementTask[]
  readonly moreCount: number
}

/** しおりの区画の状態。`none` は区画ごと省く。 */
export type DiaryBookBookmark =
  | { readonly kind: "none" }
  | { readonly kind: "pending" }
  | {
      readonly kind: "placed"
      readonly taskId: string
      readonly summary: string
      readonly reason: string
    }

/** 右ページの1段落。2つ目以降だけ書いた時刻を持つ。 */
export type DiaryBookParagraph = {
  readonly key: string
  readonly body: string
  readonly timeLabel: string | undefined
}

export type DiaryBookRight =
  | { readonly kind: "written"; readonly paragraphs: readonly DiaryBookParagraph[] }
  | { readonly kind: "blank"; readonly review: AchievementReviewButton }

export type DiaryBookPage =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | {
      readonly kind: "ready"
      readonly date: string
      readonly kanjiDate: string
      readonly weekday: string
      readonly lampLevel: LampLevel
      readonly lampLabel: string
      readonly bookmark: DiaryBookBookmark
      readonly tasks: DiaryBookTaskList
      readonly badges: readonly DiaryBookBadge[]
      readonly right: DiaryBookRight
      readonly portraitName: string
      readonly portrait: PortraitAppearance
    }

export type DiaryBookTocDay = { readonly date: string; readonly label: string }
export type DiaryBookTocMonth = {
  readonly heading: string
  readonly days: readonly DiaryBookTocDay[]
}

export type DiaryBookModel = {
  readonly open: boolean
  readonly openNote: string
  readonly dialogLabel: string
  readonly page: DiaryBookPage
  readonly previous: { readonly date: string; readonly label: string } | undefined
  readonly next: { readonly date: string; readonly label: string } | undefined
  readonly toc: { readonly open: boolean; readonly months: readonly DiaryBookTocMonth[] }
  /** 灯りの暦のマスから開く（見ている日も一緒に切り替える）。 */
  readonly onOpenFromCalendar: (date: string) => void
  /** 日記の区画の「日記帳で読む」から、いま見ている日で開く。日が分からなければ何もしない。 */
  readonly onOpenFromDiarySection: () => void
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly onToggleToc: () => void
  readonly onSelectTocDate: (date: string) => void
  readonly onClose: () => void
}

export function useDiaryBook(params: {
  /** `useAchievementCalendar` の戻り値をそのまま渡す（`diaryDates` をここで取り出す）。 */
  readonly calendar: AchievementCalendarView
  /** `useAchievement` の `daySwitch` をそのまま渡す（見ている日をここで取り出す）。 */
  readonly daySwitch: AchievementDaySwitch
  /** 見ている日を切り替える（`useAchievement` の `onSelectDate` をそのまま渡す）。 */
  readonly onDateSelected: (date: string) => void
}): DiaryBookModel {
  const diaryDates = params.calendar.kind === "known" ? params.calendar.diaryDates : []
  const viewedDate = params.daySwitch.kind === "known" ? params.daySwitch.date : undefined

  const [state, setState] = useState<BookState>({ kind: "closed" })
  const dispatch = useSession((session) => session.dispatch)
  const diaryWriting = useSession((session) => session.state.diaryWriting)
  const character = useSession((session) => session.state.character)
  const characterPacks = useSession((session) => session.state.characterPacks)

  // 書き終わりの知らせの「日記帳で開く」を拾って開く。
  // 拾ったかどうかは `takeDiaryBookOpenRequest` が部品の外に持つ（画面を開き直しても同じ合図で開き直さない）。
  const pendingRequest = takeDiaryBookOpenRequest(useDiaryBookOpenRequest())
  if (pendingRequest !== undefined) {
    setState({ kind: "open", source: "notice", date: pendingRequest.date, tocOpen: false })
  }

  // 閉じている間は取りに行かない（`skipToken`）。
  const query = useQuery(
    rpc.achievement.day.queryOptions({
      input: state.kind === "open" ? { kind: "chosen", date: state.date } : skipToken,
      staleTime: 0,
    }),
  )

  const onClose = (): void => {
    setState({ kind: "closed" })
  }
  const onOpenFromCalendar = (date: string): void => {
    params.onDateSelected(date)
    setState({ kind: "open", source: "calendar", date, tocOpen: false })
  }
  const onOpenFromDiarySection = (): void => {
    if (viewedDate === undefined) {
      return
    }
    setState({ kind: "open", source: "diary-section", date: viewedDate, tocOpen: false })
  }

  if (state.kind !== "open") {
    return {
      open: false,
      openNote: "",
      dialogLabel: DIARY_BOOK_TITLE,
      page: { kind: "loading" },
      previous: undefined,
      next: undefined,
      toc: { open: false, months: [] },
      onOpenFromCalendar,
      onOpenFromDiarySection,
      onPrevious: () => {},
      onNext: () => {},
      onToggleToc: () => {},
      onSelectTocDate: () => {},
      onClose,
    }
  }

  const previousDate = closestBefore(diaryDates, state.date)
  const nextDate = closestAfter(diaryDates, state.date)
  const page = pageOf(
    state.date,
    query.data,
    query.isPending,
    query.isError,
    character,
    characterPacks,
    diaryWriting,
    params.onDateSelected,
    dispatch,
    onClose,
  )

  return {
    open: true,
    openNote: OPEN_NOTE[state.source],
    dialogLabel: dialogLabelOf(page),
    page,
    previous:
      previousDate === undefined
        ? undefined
        : { date: previousDate, label: monthDayLabel(Temporal.PlainDate.from(previousDate)) },
    next:
      nextDate === undefined
        ? undefined
        : { date: nextDate, label: monthDayLabel(Temporal.PlainDate.from(nextDate)) },
    toc: { open: state.tocOpen, months: tocMonthsOf(diaryDates) },
    onOpenFromCalendar,
    onOpenFromDiarySection,
    onPrevious: () => {
      if (previousDate !== undefined) {
        setState({ ...state, date: previousDate })
      }
    },
    onNext: () => {
      if (nextDate !== undefined) {
        setState({ ...state, date: nextDate })
      }
    },
    onToggleToc: () => {
      setState({ ...state, tocOpen: !state.tocOpen })
    },
    onSelectTocDate: (date) => {
      setState({ ...state, date, tocOpen: false })
    },
    onClose,
  }
}

function pageOf(
  date: string,
  data: DailyAchievement | undefined,
  isPending: boolean,
  isError: boolean,
  character: CharacterInfo | undefined,
  characterPacks: readonly CharacterPackEntry[],
  diaryWriting: DiaryWriting,
  onDateSelected: (date: string) => void,
  dispatch: SessionDispatch,
  onClose: () => void,
): DiaryBookPage {
  if (isPending) {
    return { kind: "loading" }
  }
  if (data === undefined || data.kind === "unknown" || isError) {
    return { kind: "failed" }
  }

  const written = data.diary.kind === "written" ? data.diary.diary : undefined
  const portrait = currentWriterPortraitOf(data.diary, character, characterPacks)
  const parsed = Temporal.PlainDate.from(date)

  const right: DiaryBookRight =
    written === undefined
      ? {
          kind: "blank",
          review: blankReviewOf(
            data.doneTasks,
            diaryWriting,
            date,
            onDateSelected,
            dispatch,
            onClose,
          ),
        }
      : { kind: "written", paragraphs: paragraphsOf(written) }

  const bookmark: DiaryBookBookmark =
    written === undefined
      ? { kind: "pending" }
      : written.bookmark.kind === "placed"
        ? written.bookmark
        : { kind: "none" }
  const lamp = lampLevel(data.doneTasks.length)

  return {
    kind: "ready",
    date,
    kanjiDate: kanjiDateLabel(parsed),
    weekday: kanjiWeekdayLabel(parsed),
    lampLevel: lamp,
    lampLabel: `灯り　${LAMP_LABEL[lamp]}`,
    bookmark,
    tasks: taskListOf(data.doneTasks),
    badges: badgesOf(data.graduations, data.milestones),
    right,
    portraitName: portrait.name,
    portrait: portrait.portrait,
  }
}

function paragraphsOf(diary: Diary): readonly DiaryBookParagraph[] {
  return diary.paragraphs.map((paragraph, index) => {
    const time = writtenTimeOf(paragraph.writtenAt)
    return {
      key: `${diary.date}-${String(index)}`,
      body: paragraph.body,
      timeLabel: index === 0 || time === undefined ? undefined : `〔${time}〕`,
    }
  })
}

/** 白紙の日の主ボタン。押せないのは空の日と、日記を書いている間。 */
function blankReviewOf(
  doneTasks: readonly AchievementTask[],
  diaryWriting: DiaryWriting,
  date: string,
  onDateSelected: (date: string) => void,
  dispatch: SessionDispatch,
  onClose: () => void,
): AchievementReviewButton {
  const availability = reviewAvailabilityOf(doneTasks, diaryWriting)

  return {
    label: BLANK_REVIEW_LABEL,
    availability,
    onReview: () => {
      if (availability.kind !== "available") {
        return
      }
      dispatch.session.reflectAchievement({ date })
      onDateSelected(date)
      onClose()
    },
  }
}

function dialogLabelOf(page: DiaryBookPage): string {
  if (page.kind !== "ready") {
    return DIARY_BOOK_TITLE
  }
  return page.right.kind === "written"
    ? `${page.kanjiDate}の日記`
    : `${page.kanjiDate}のページ（まだ白紙）`
}

function taskListOf(doneTasks: readonly AchievementTask[]): DiaryBookTaskList {
  const items = doneTasks.slice(0, 4)
  return { items, moreCount: doneTasks.length - items.length }
}

function badgesOf(
  graduations: readonly AchievementGraduation[],
  milestones: readonly AchievementMilestone[],
): readonly DiaryBookBadge[] {
  const graduationBadges = graduations.map((graduation): DiaryBookBadge => ({
    kind: "graduation",
    key: `graduation-${graduation.id}`,
    taskId: graduation.id,
  }))
  const milestoneBadges = milestones.map((milestone): DiaryBookBadge => ({
    kind: "milestone",
    key: `milestone-${milestone.taskId}`,
    countLabel: kanjiNumeral(milestone.count),
  }))
  return [...graduationBadges, ...milestoneBadges]
}

/** 日付より前で最も近い日記のある日。 */
function closestBefore(dates: readonly string[], date: string): string | undefined {
  return dates
    .filter((candidate) => candidate < date)
    .reduce<string | undefined>(
      (max, candidate) => (max === undefined || candidate > max ? candidate : max),
      undefined,
    )
}

/** 日付より後で最も近い日記のある日。 */
function closestAfter(dates: readonly string[], date: string): string | undefined {
  return dates
    .filter((candidate) => candidate > date)
    .reduce<string | undefined>(
      (min, candidate) => (min === undefined || candidate < min ? candidate : min),
      undefined,
    )
}

/** 月ごとに畳む（新しい順のまま。同じ月が連続する前提で `diaryDates` を1回なめるだけ）。 */
function tocMonthsOf(diaryDates: readonly string[]): readonly DiaryBookTocMonth[] {
  return diaryDates.reduce<readonly DiaryBookTocMonth[]>((months, date) => {
    const heading = monthHeadingOf(date)
    const day: DiaryBookTocDay = { date, label: dayLabel(Temporal.PlainDate.from(date)) }
    const last = months.at(-1)
    if (last !== undefined && last.heading === heading) {
      return [...months.slice(0, -1), { heading, days: [...last.days, day] }]
    }
    return [...months, { heading, days: [day] }]
  }, [])
}

/** 「2026年9月」の形（年をまたいでも区別が付くよう年を添える）。 */
function monthHeadingOf(dateKey: string): string {
  const date = Temporal.PlainDate.from(dateKey)
  return `${String(date.year)}年${String(date.month)}月`
}
