// 灯りの暦（`docs/screen-design.md` 13.10「灯りの暦」）。直近5週の日ごとの成果を、狐火の灯りで
// 並べる。マスを押すと見ている日が変わる（見開きを開く口はまだ無い。別タスクで足す）。

import { type ReactElement } from "react"

import {
  lampLevel,
  type AchievementCalendarDay,
  type LampLevel,
} from "../../../../shared/achievement-calendar.ts"
import styles from "./achievement.module.css"
import { type AchievementCalendarView } from "./hooks/use-achievement-calendar.ts"

const WEEKDAY_HEADS = ["月", "火", "水", "木", "金", "土", "日"] satisfies readonly string[]

const LAMP_LABEL: Readonly<Record<LampLevel, string>> = {
  none: "灯りなし",
  faint: "ほのか",
  lit: "ともる",
  bright: "明るい",
}

/** 段階ごとの見た目の大きさ（見本の px 値）。段階が上がるほど大きく・強く光らせる。 */
const LAMP_SIZE_PX: Readonly<Record<LampLevel, number>> = {
  none: 22,
  faint: 18,
  lit: 20,
  bright: 23,
}

const FLAME_PATH =
  "M12 2.5c1.6 3.7 5.5 5.6 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.7 1.4-4.2 2.6-5.6.2 1.4 1 2.3 2 2.6-.4-2.8.3-5.3.9-7.6z"

export type LanternCalendarProps = {
  readonly calendar: AchievementCalendarView
  /** 見ている日（枠を `--accent` にする。まだ分からなければ `undefined`）。 */
  readonly viewedDate: string | undefined
  readonly onSelectDate: (date: string) => void
}

export function LanternCalendar(props: LanternCalendarProps): ReactElement {
  const { calendar } = props

  return (
    <section aria-label="灯りの暦" className={styles["achievement-calendar"]}>
      <div className={styles["achievement-calendar-heading"]}>
        <h2 className={styles["achievement-calendar-title"]}>
          灯りの暦
          <span className={styles["achievement-calendar-note"]}>
            成果のあった日に狐火がともります · 押すとその日へ
          </span>
        </h2>
        <Legend />
      </div>
      {calendar.kind === "loading" ? (
        <p className={styles["achievement-note"]}>…</p>
      ) : calendar.kind === "unknown" ? (
        <p className={styles["achievement-note"]}>灯りの暦を取れなかった。</p>
      ) : (
        <Grid calendar={calendar} viewedDate={props.viewedDate} onSelectDate={props.onSelectDate} />
      )}
    </section>
  )
}

function Legend(): ReactElement {
  return (
    <div className={styles["achievement-calendar-legend"]}>
      {(Object.keys(LAMP_LABEL) as readonly LampLevel[]).map((level) => (
        <span key={level} className={styles["achievement-calendar-legend-item"]}>
          <Lamp level={level} />
          {LAMP_LABEL[level]}
        </span>
      ))}
      <span className={styles["achievement-calendar-legend-item"]}>
        <Bell />
        日記あり
      </span>
    </div>
  )
}

type GridProps = {
  readonly calendar: Extract<AchievementCalendarView, { readonly kind: "known" }>
  readonly viewedDate: string | undefined
  readonly onSelectDate: (date: string) => void
}

function Grid(props: GridProps): ReactElement {
  const { calendar } = props
  // **マスの並びは月曜はじまりの7列×5段の固定枠**（13.10「灯りの暦」）。データを配る
  // `achievementCalendarDateKeys` は今日までしか返さない（サーバは今日より後を数えない）ので、
  // 表示ぶんの35日は同じ開始日（4週前の月曜）から自分で数える——今日を含む週の残りの曜日も
  // マス自体は出す（薄く・押せない日付だけ）。
  const dateKeys = fullCalendarDateKeys(calendar.today)
  const dayOf = new Map(calendar.days.map((day) => [day.date, day] as const))
  const diaryDates = new Set(calendar.diaryDates)
  const first = dateKeys[0]
  const last = dateKeys.at(-1)

  return (
    <>
      <div className={styles["achievement-calendar-grid"]}>
        {WEEKDAY_HEADS.map((head) => (
          <span key={head} className={styles["achievement-calendar-head"]}>
            {head}
          </span>
        ))}
        {dateKeys.map((date, index) =>
          date > calendar.today ? (
            <span key={date} className={styles["achievement-calendar-future"]}>
              {cellDateLabel(date, index)}
            </span>
          ) : (
            <DayCell
              key={date}
              date={date}
              index={index}
              day={dayOf.get(date)}
              hasDiary={diaryDates.has(date)}
              isToday={date === calendar.today}
              isViewed={date === props.viewedDate}
              onSelectDate={props.onSelectDate}
            />
          ),
        )}
      </div>
      {first !== undefined && last !== undefined ? (
        <p className={styles["achievement-calendar-range"]}>
          {monthDayLabel(first)}〜{monthDayLabel(last)}
        </p>
      ) : null}
    </>
  )
}

type DayCellProps = {
  readonly date: string
  readonly index: number
  readonly day: AchievementCalendarDay | undefined
  readonly hasDiary: boolean
  readonly isToday: boolean
  readonly isViewed: boolean
  readonly onSelectDate: (date: string) => void
}

function DayCell(props: DayCellProps): ReactElement {
  const level = lampLevel(props.day?.commitCount ?? 0)
  const label = `${monthDayLabel(props.date)} 灯り ${LAMP_LABEL[level]}${props.hasDiary ? "・日記あり" : ""}`

  return (
    <button
      type="button"
      className={styles["achievement-calendar-day"]}
      data-today={props.isToday ? "yes" : undefined}
      data-viewed={props.isViewed ? "yes" : undefined}
      aria-label={label}
      onClick={() => {
        props.onSelectDate(props.date)
      }}
    >
      <span className={styles["achievement-calendar-day-date"]}>
        {cellDateLabel(props.date, props.index)}
      </span>
      {props.hasDiary ? (
        <span className={styles["achievement-calendar-day-bell"]}>
          <Bell />
        </span>
      ) : null}
      <Lamp level={level} />
      {props.isToday ? (
        <span className={styles["achievement-calendar-day-today"]}>今日</span>
      ) : null}
    </button>
  )
}

function Lamp(props: { readonly level: LampLevel }): ReactElement {
  const size = LAMP_SIZE_PX[props.level]
  if (props.level === "none") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d={FLAME_PATH} fill="none" stroke="var(--rule)" strokeWidth="1.2" />
      </svg>
    )
  }
  const opacity = props.level === "faint" ? 0.32 : props.level === "lit" ? 0.66 : 1
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={styles[`achievement-calendar-lamp-${props.level}`]}
    >
      <path d={FLAME_PATH} fill="var(--accent)" fillOpacity={opacity} />
      {props.level === "bright" ? (
        <path
          d="M12 11c.9 1.6 2.3 2.4 2.3 4.2a2.3 2.3 0 0 1-4.6 0c0-1.3.9-2.4 2.3-4.2z"
          fill="var(--ground)"
          opacity="0.85"
        />
      ) : null}
    </svg>
  )
}

/** 「日記あり」の鈴（13.10「灯りの暦」）。書き終わりの知らせ（`diary-notice.tsx`）も同じ鈴を使う
 * （`size` は知らせのぶんだけ大きく出すため。既定は暦のマスの大きさ）。 */
export function Bell(props: { readonly size?: number } = {}): ReactElement {
  const size = props.size ?? 12
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" fill="var(--diary-gold)" />
      <circle cx="12" cy="20.5" r="1.8" fill="var(--diary-gold)" />
    </svg>
  )
}

/** マスの左上の日付。月の初日と最初のマスだけ「9/1」の形、ほかは日だけ（13.10「灯りの暦」）。 */
function cellDateLabel(date: string, index: number): string {
  const parsed = Temporal.PlainDate.from(date)
  return parsed.day === 1 || index === 0
    ? `${String(parsed.month)}/${String(parsed.day)}`
    : String(parsed.day)
}

/** 「8月24日」の形（曜日は付けない。`day-switch.tsx` の `dayLabel` は曜日つきで別物）。 */
function monthDayLabel(dateKey: string): string {
  const date = Temporal.PlainDate.from(dateKey)
  return `${String(date.month)}月${String(date.day)}日`
}

/**
 * マスの並びぶん（月曜はじまりの7列×5段＝35日）の日付キー、古い順。開始日は
 * `achievementCalendarDateKeys`（`src/shared/achievement-calendar.ts`）と同じ「今日を含む週の
 * 月曜から4週前の月曜」——**そちらは今日より後を返さない**ので、表示の枠を埋める残りの曜日は
 * ここで別に数える。
 */
function fullCalendarDateKeys(today: string): readonly string[] {
  const todayDate = Temporal.PlainDate.from(today)
  const mondayOfThisWeek = todayDate.subtract({ days: todayDate.dayOfWeek - 1 })
  const start = mondayOfThisWeek.subtract({ weeks: 4 })
  return Array.from({ length: 35 }, (_, index) => start.add({ days: index }).toString())
}
