// つくもの日記帳の見開き（`docs/screen-design.md` 13.10「日記帳の見開き」）。開閉・見ている日・
// 目次の開閉という「保つ」、`<dialog>` の DOM 同期と `GET /achievement?date=` の取得という
// 「外と同期」、漢数字・しおり・終えたこと・卒業と節目の畳み込みという「畳む」の3種がそろうので
// フックを切る（docs/design.md 2章「機能の中を分ける」）。
//
// **container / presentational の3分割は採らない。** 開く口が暦のマス（`lantern-calendar.tsx`）と
// 日記の区画（`diary-section.tsx`）の2箇所にまたがり、どちらも `achievement-screen.tsx`
// （成果の画面の container）から配る値が要るので、`useDiaryBook` は `achievement-screen.tsx` から
// 直接呼び、戻り値をそのまま渡す部品を `../diary-book.tsx`（`DiarySection` / `LanternCalendar` と
// 同じ、フックを持たない受け取るだけの部品）に置く。
//
// **1日ぶんの取得は `use-achievement.ts` と同じ経路・同じ応答形**（`GET /achievement?date=`）を、
// 開いている日だけ別に引く。前後の日・目次に並べる日は `use-achievement-calendar.ts` が既に
// 持っている `diaryDates`（すべての日記のある日、新しい順）をそのまま受け取る（新しい経路は
// 増やさない）。
//
// **正典と実物・仮決めのすり合わせ**:
// 1. 目次にしおりのタスク ID は載せない（`diaryDates` はファイル名の一覧だけで中身を読まない
//    設計のため。`src/server/diary/adapter/diary.ts` の `listDiaryDates`）
// 2. 「日記帳で読む」から開いたときの添え書きは「この日の日記から開きました」と仮に決めた
// 3. 書かれた日記でしおりが無い日は、しおりの区画ごと省く（成果の画面本体と同じ扱い）
// 4. 縦書き本文のオーバーフローは `overflow: auto`（`achievement.module.css`）で両軸に任せる

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { lampLevel, type LampLevel } from "../../../../../shared/achievement-calendar.ts"
import {
  ACHIEVEMENT_DATE_QUERY_NAME,
  ACHIEVEMENT_PATH,
  isEmptyAchievementDay,
  readDailyAchievement,
  type AchievementDoneTasks,
  type AchievementGraduation,
  type AchievementMilestone,
  type AchievementTask,
  type DailyAchievement,
} from "../../../../../shared/achievement.ts"
import { type CharacterInfo, type CharacterPackEntry } from "../../../../../shared/character.ts"
import { type DailyDiaryStatus, type Diary } from "../../../../../shared/diary.ts"
import {
  DEFAULT_CHARACTER_NAME,
  portraitAppearance,
  type PortraitAppearance,
} from "../../../../domain/portrait-appearance.ts"
import { sessionTokenUrl } from "../../../../lib/session-token-url.ts"
import {
  useSessionDispatch,
  useSessionSelector,
  useTurnRunning,
  type SessionDispatch,
} from "../../../../stores/session.tsx"
import { dayLabel } from "../../../../utils/day-label.ts"
import { monthDayLabel } from "../../../../utils/month-day-label.ts"
import { takeDiaryBookOpenRequest, useDiaryBookOpenRequest } from "../diary-book-request.ts"
import { diaryWriterPortraitOf } from "../diary-writer.ts"
import { kanjiDateLabel, kanjiNumeral, kanjiWeekdayLabel } from "../domain/kanji-date.ts"
import { type AchievementCalendarView } from "./use-achievement-calendar.ts"
import {
  type AchievementDaySwitch,
  type AchievementReviewAvailability,
  type AchievementReviewButton,
} from "./use-achievement.ts"

const EMPTY_DAY_REASON = "振り返る成果が無い"
const TURN_RUNNING_REASON = "いまターンが動いているので送れない"
const BLANK_REVIEW_LABEL = "この日を振り返る"

/** 見開きを開いた口（13.10「日記帳の見開き」頭の行の添え書き）。`notice` は書き終わりの知らせの
 * 「日記帳で開く」（`diary-notice.tsx`。13.10「書き終わりの知らせ」）。 */
export type DiaryBookOpenSource = "calendar" | "diary-section" | "notice"

const OPEN_NOTE: Readonly<Record<DiaryBookOpenSource, string>> = {
  calendar: "灯りの暦から開きました",
  "diary-section": "この日の日記から開きました",
  notice: "書き終わりの知らせから開きました",
}

const LAMP_LABEL: Readonly<Record<LampLevel, string>> = {
  none: "灯りなし",
  faint: "ほのか",
  lit: "ともる",
  bright: "明るい",
}

type BookState =
  | { readonly kind: "closed" }
  | {
      readonly kind: "open"
      readonly source: DiaryBookOpenSource
      readonly date: string
      readonly tocOpen: boolean
    }

/** 左下に並べる丸い印（卒業・節目。13.10「日記帳の見開き」左ページ）。 */
export type DiaryBookBadge =
  | { readonly kind: "graduation"; readonly key: string; readonly taskId: string }
  | {
      readonly kind: "milestone"
      readonly key: string
      readonly countLabel: string
      readonly unitLabel: string
    }

/** 「この日に終えたこと」（13.10「日記帳の見開き」左ページ）。 */
export type DiaryBookTaskList = {
  readonly items: readonly AchievementTask[]
  readonly moreCount: number
  readonly commitCount: number
  readonly tasksKnown: boolean
}

/** しおりの区画の状態。`none` は区画ごと省く（成果の画面本体と同じ扱い）。 */
export type DiaryBookBookmark =
  | { readonly kind: "none" }
  | { readonly kind: "pending" }
  | {
      readonly kind: "placed"
      readonly taskId: string
      readonly summary: string
      readonly reason: string
    }

/** 右ページの1段落。2つ目以降だけ書いた時刻を持つ（13.10「書き足したときの段落の区切り」）。 */
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
  readonly page: DiaryBookPage
  readonly previous: { readonly date: string; readonly label: string } | undefined
  readonly next: { readonly date: string; readonly label: string } | undefined
  readonly toc: { readonly open: boolean; readonly months: readonly DiaryBookTocMonth[] }
  /** 灯りの暦のマスから開く（見ている日も一緒に切り替える。13.10「灯りの暦」「押すと」）。 */
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
  /** `use-achievement-calendar.ts` の戻り値をそのまま渡す（`diaryDates` をここで取り出す）。 */
  readonly calendar: AchievementCalendarView
  /** `use-achievement.ts` の `daySwitch` をそのまま渡す（見ている日をここで取り出す）。 */
  readonly daySwitch: AchievementDaySwitch
  /** 見ている日を切り替える（`use-achievement.ts` の `onSelectDate` をそのまま渡す）。 */
  readonly onDateSelected: (date: string) => void
}): DiaryBookModel {
  const diaryDates = params.calendar.kind === "known" ? params.calendar.diaryDates : []
  const viewedDate = params.daySwitch.kind === "known" ? params.daySwitch.date : undefined

  const [state, setState] = useState<BookState>({ kind: "closed" })
  const dispatch = useSessionDispatch()
  const turnRunning = useTurnRunning()
  const character = useSessionSelector((session) => session.state.character)
  const characterPacks = useSessionSelector((session) => session.state.characterPacks)

  // 書き終わりの知らせの「日記帳で開く」（`diary-notice.tsx`）を拾って開く。**`useEffect` は
  // 使わない**——4類型のどれにも当たらない（`docs/coding-standards.md`「React」）。合図は
  // `useDiaryBookOpenRequest`（`useSyncExternalStore`。「外部ストアの購読」）で拾い、拾ったかどうかは
  // `takeDiaryBookOpenRequest` が React の外に持つ（画面を開き直しても同じ合図で開き直さない）。
  const pendingRequest = takeDiaryBookOpenRequest(useDiaryBookOpenRequest())
  if (pendingRequest !== undefined) {
    setState({ kind: "open", source: "notice", date: pendingRequest.date, tocOpen: false })
  }

  const queryDate = state.kind === "open" ? state.date : undefined
  const query = useQuery({
    queryKey: ["achievement", queryDate ?? ""],
    queryFn: () => fetchBookDay(queryDate ?? ""),
    enabled: queryDate !== undefined,
    staleTime: 0,
  })

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
    turnRunning,
    params.onDateSelected,
    dispatch,
    onClose,
  )

  return {
    open: true,
    openNote: OPEN_NOTE[state.source],
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

/** 取りに行く。`use-achievement.ts` の `fetchAchievement` と同じ形（別の経路は増やさない）。 */
async function fetchBookDay(date: string): Promise<DailyAchievement> {
  const response = await fetch(
    sessionTokenUrl(ACHIEVEMENT_PATH, { [ACHIEVEMENT_DATE_QUERY_NAME]: date }),
  )
  if (!response.ok) {
    throw new Error(String(response.status))
  }
  return readDailyAchievement(await response.json())
}

function pageOf(
  date: string,
  data: DailyAchievement | undefined,
  isPending: boolean,
  isError: boolean,
  character: CharacterInfo | undefined,
  characterPacks: readonly CharacterPackEntry[],
  turnRunning: boolean,
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
  const portrait = bookPortraitOf(data.diary, character, characterPacks)
  const parsed = Temporal.PlainDate.from(date)

  const right: DiaryBookRight =
    written === undefined
      ? {
          kind: "blank",
          review: blankReviewOf(
            data.commitCount,
            data.doneTasks,
            turnRunning,
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

  return {
    kind: "ready",
    date,
    kanjiDate: kanjiDateLabel(parsed),
    weekday: kanjiWeekdayLabel(parsed),
    lampLabel: `灯り　${LAMP_LABEL[lampLevel(data.commitCount)]}`,
    bookmark,
    tasks: taskListOf(data.commitCount, data.doneTasks),
    badges: badgesOf(data.graduations, data.milestones),
    right,
    portraitName: portrait.name,
    portrait: portrait.portrait,
  }
}

/** 書いたパックの立ち絵と名前。白紙の日はいまのパックを `default` の表情で
 * （`use-achievement.ts` の `diaryPortraitOf` と同じ組み立て。13.10「並べるもの」2
 * 「書いたパックが無いとき」）。 */
function bookPortraitOf(
  diary: DailyDiaryStatus,
  character: CharacterInfo | undefined,
  characterPacks: readonly CharacterPackEntry[],
): { readonly name: string; readonly portrait: PortraitAppearance } {
  if (diary.kind === "written") {
    const latest = diary.diary.paragraphs.at(-1)
    if (latest !== undefined) {
      return diaryWriterPortraitOf(latest, characterPacks)
    }
  }
  return {
    name: character?.name ?? DEFAULT_CHARACTER_NAME,
    portrait: portraitAppearance(character, "default", "default"),
  }
}

function paragraphsOf(diary: Diary): readonly DiaryBookParagraph[] {
  return diary.paragraphs.map((paragraph, index) => ({
    key: `${diary.date}-${String(index)}`,
    body: paragraph.body,
    timeLabel: index === 0 ? undefined : paragraphTimeLabel(paragraph.writtenAt),
  }))
}

/** 「〔22:10〕」の形（`diary-section.tsx` の `timeLabel` と同じ切り出し方）。 */
function paragraphTimeLabel(writtenAt: string): string | undefined {
  const match = /T(\d{2}:\d{2})/.exec(writtenAt)
  return match?.[1] === undefined ? undefined : `〔${match[1]}〕`
}

/** 白紙の日の主ボタン（13.10「日記帳の見開き」白紙の日（e））。押せない条件は成果の画面本体の
 * 振り返りのボタン（`use-achievement.ts` の `reviewButtonOf`）と同じ判定を、この見開きの日付で
 * 別に組む（`view`/`daySwitch` の形に依存しないぶんだけ簡単になる）。 */
function blankReviewOf(
  commitCount: number,
  doneTasks: AchievementDoneTasks,
  turnRunning: boolean,
  date: string,
  onDateSelected: (date: string) => void,
  dispatch: SessionDispatch,
  onClose: () => void,
): AchievementReviewButton {
  const availability: AchievementReviewAvailability = isEmptyAchievementDay(commitCount, doneTasks)
    ? { kind: "blocked", reason: EMPTY_DAY_REASON }
    : turnRunning
      ? { kind: "blocked", reason: TURN_RUNNING_REASON }
      : { kind: "available" }

  return {
    label: BLANK_REVIEW_LABEL,
    availability,
    onReview: () => {
      if (availability.kind !== "available") {
        return
      }
      dispatch({ type: "reflect-achievement", date })
      onDateSelected(date)
      onClose()
    },
  }
}

function taskListOf(commitCount: number, doneTasks: AchievementDoneTasks): DiaryBookTaskList {
  if (doneTasks.kind === "unknown") {
    return { items: [], moreCount: 0, commitCount, tasksKnown: false }
  }
  const items = doneTasks.items.slice(0, 4)
  return { items, moreCount: doneTasks.items.length - items.length, commitCount, tasksKnown: true }
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
    key:
      milestone.kind === "task"
        ? `milestone-task-${milestone.taskId}`
        : `milestone-commit-${milestone.time}`,
    countLabel: kanjiNumeral(milestone.count),
    unitLabel: milestone.kind === "task" ? "件目のタスク" : "コミット目",
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
