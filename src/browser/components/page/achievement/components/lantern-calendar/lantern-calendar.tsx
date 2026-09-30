// 灯りの暦。直近5週の日ごとの成果を、狐火の灯りで並べる。

import type { ReactElement } from "react"
import { keys } from "remeda"

import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { LAMP_LABEL } from "../../domain/lamp-label.ts"
import type { AchievementCalendarView, CalendarCell } from "../../hooks/use-achievement-calendar.ts"
import { Bell } from "../bell/bell.tsx"
import { Lamp } from "../lamp/lamp.tsx"
import styles from "./lantern-calendar.module.css"

const WEEKDAY_HEADS = ["月", "火", "水", "木", "金", "土", "日"] satisfies readonly string[]

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
        <Heading level={2} size="subheading" tone="ink" weight="bold" className="">
          灯りの暦
          <Text
            element="span"
            size="secondary"
            tone="ink-quiet"
            weight="normal"
            className={styles["achievement-calendar-note"]}
          >
            成果のあった日に狐火がともります · 押すとその日へ
          </Text>
        </Heading>
        <Legend />
      </HStack>
      {calendar.kind === "loading" ? (
        <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
          …
        </Text>
      ) : calendar.kind === "unknown" ? (
        <Text element="p" size="body" tone="ink-quiet" weight="inherit" className="">
          灯りの暦を取れなかった。
        </Text>
      ) : (
        <Grid
          cells={calendar.cells}
          rangeLabel={calendar.rangeLabel}
          viewedDate={props.viewedDate}
          onSelectDate={props.onSelectDate}
        />
      )}
    </section>
  )
}

function Legend(): ReactElement {
  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      ref={undefined}
      gap="md"
      align="stretch"
      justify="start"
      wrap="wrap"
      className={styles["achievement-calendar-legend"]}
    >
      {keys(LAMP_LABEL).map((level) => (
        <Text
          key={level}
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["achievement-calendar-legend-item"]}
        >
          <Lamp level={level} />
          {LAMP_LABEL[level]}
        </Text>
      ))}
      <Text
        element="span"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["achievement-calendar-legend-item"]}
      >
        <Bell />
        日記あり
      </Text>
    </HStack>
  )
}

type GridProps = {
  readonly cells: readonly CalendarCell[]
  readonly rangeLabel: string
  readonly viewedDate: string | undefined
  readonly onSelectDate: (date: string) => void
}

function Grid(props: GridProps): ReactElement {
  return (
    <>
      <div className={styles["achievement-calendar-grid"]}>
        {WEEKDAY_HEADS.map((head) => (
          <Text
            key={head}
            element="span"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["achievement-calendar-head"]}
          >
            {head}
          </Text>
        ))}
        {props.cells.map((cell) =>
          cell.kind === "future" ? (
            <Text
              key={cell.key}
              element="span"
              size="label"
              tone="ink-quiet"
              weight="inherit"
              className={styles["achievement-calendar-future"]}
            >
              {cell.dateLabel}
            </Text>
          ) : (
            <DayCell
              key={cell.key}
              cell={cell}
              isViewed={cell.date === props.viewedDate}
              onSelectDate={props.onSelectDate}
            />
          ),
        )}
      </div>
      {props.rangeLabel !== "" && (
        <Text element="p" size="label" tone="ink-quiet" weight="inherit" className="">
          {props.rangeLabel}
        </Text>
      )}
    </>
  )
}

type DayCellProps = {
  readonly cell: Extract<CalendarCell, { readonly kind: "day" }>
  readonly isViewed: boolean
  readonly onSelectDate: (date: string) => void
}

function DayCell(props: DayCellProps): ReactElement {
  const { cell } = props

  return (
    <button
      type="button"
      className={styles["achievement-calendar-day"]}
      data-today={cell.isToday ? "yes" : undefined}
      data-viewed={props.isViewed ? "yes" : undefined}
      aria-label={cell.ariaLabel}
      onClick={() => {
        props.onSelectDate(cell.date)
      }}
    >
      <Text
        element="span"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["achievement-calendar-day-date"]}
      >
        {cell.dateLabel}
      </Text>
      {cell.hasDiary && (
        <HStack
          element="span"
          name={{ kind: "none" }}
          ref={undefined}
          gap="none"
          align="stretch"
          justify="start"
          wrap="nowrap"
          className={styles["achievement-calendar-day-bell"]}
        >
          <Bell />
        </HStack>
      )}
      <Lamp level={cell.level} />
      {cell.isToday && (
        <Text
          element="span"
          size="label"
          tone="accent"
          weight="bold"
          className={styles["achievement-calendar-day-today"]}
        >
          今日
        </Text>
      )}
    </button>
  )
}
