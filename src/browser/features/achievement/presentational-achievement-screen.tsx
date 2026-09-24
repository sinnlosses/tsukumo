// 成果の画面の器（docs/design.md 2章「機能の中を分ける」）。フックも算出も持たず、受け取った値を
// そのまま置く。並べるもの・空の日の見せ方は docs/screen-design.md 13.10 が正典。
//
// **振り返りのボタン（13.10「並べるもの」4）は `ready` の中身の下に置く**——`loading` /
// `failed` のときは押しても送る数が定まらないので、`use-achievement.ts` の `review` が
// `blocked` かつ理由を持たない形で返ってくる（そのときはボタンを出さない）。

import { type ReactElement } from "react"

import { previousDateKey, type AchievementTask } from "../../../shared/achievement.ts"
import { dayLabel } from "../../utils/day-label.ts"
import styles from "./achievement.module.css"
import {
  type AchievementDaySwitch,
  type AchievementReviewButton,
  type AchievementView,
  type UseAchievementResult,
} from "./hooks/use-achievement.ts"

const UNAVAILABLE_NOTE = "このディレクトリでは成果を数えられない（main が読めない）"
const FAILED_NOTE = "成果を取れなかった。"
const EMPTY_DAY_NOTE = "この日に main へ入った成果は無い。"
const NO_DONE_TASKS_NOTE = "この日に終えたタスクは無い。"
const UNKNOWN_TASKS_NOTE = "タスクの記録が無い"
const NEXT_DAY_TITLE = "未来の日は無い"
/** まだ何も届いていない・分からないときの表示（数の札は「…」、日の切り替えの日付も同じ）。 */
const LOADING_VALUE = "…"
/** 「終えたタスク」の数を数えられないときの表示。 */
const UNKNOWN_VALUE = "—"

export type PresentationalAchievementScreenProps = UseAchievementResult

export function PresentationalAchievementScreen(
  props: PresentationalAchievementScreenProps,
): ReactElement {
  return (
    <div className={styles.achievement}>
      <h1 className={styles["achievement-title"]}>成果</h1>
      {props.view.kind === "unavailable" ? (
        <p className={styles["achievement-note"]}>{UNAVAILABLE_NOTE}</p>
      ) : (
        <>
          <DaySwitch
            daySwitch={props.daySwitch}
            onPreviousDay={props.onPreviousDay}
            onNextDay={props.onNextDay}
            onToday={props.onToday}
          />
          <Content view={props.view} isFetching={props.isFetching} review={props.review} />
        </>
      )}
    </div>
  )
}

type DaySwitchProps = {
  readonly daySwitch: AchievementDaySwitch
  readonly onPreviousDay: () => void
  readonly onNextDay: () => void
  readonly onToday: () => void
}

/**
 * 日の切り替え（13.10「並べるもの」1）。**前の日は制限しない**が、まだ何日を見ているか分からない
 * 間（読み込み中・一度も届いていない失敗）は3つとも押せない——前後の日の計算にも「今日へ」の
 * 判定にも、直前に届いた日付が要る（`hooks/use-achievement.ts` の {@link AchievementDaySwitch}）。
 */
function DaySwitch(props: DaySwitchProps): ReactElement {
  const { daySwitch } = props
  const known = daySwitch.kind === "known"
  const isToday = known && daySwitch.date === daySwitch.today

  return (
    <div className={styles["achievement-day-switch"]}>
      <button
        type="button"
        className={styles["achievement-day-switch-button"]}
        aria-disabled={!known}
        onClick={props.onPreviousDay}
      >
        ‹ 前の日
      </button>
      <span className={styles["achievement-day-switch-label"]}>{dayHeading(daySwitch)}</span>
      <button
        type="button"
        className={styles["achievement-day-switch-button"]}
        aria-disabled={!known || isToday}
        title={isToday ? NEXT_DAY_TITLE : undefined}
        onClick={props.onNextDay}
      >
        次の日 ›
      </button>
      <button
        type="button"
        className={`${styles["achievement-day-switch-button"]} ${styles["achievement-day-switch-today"] ?? ""}`}
        aria-disabled={isToday}
        onClick={props.onToday}
      >
        今日へ
      </button>
    </div>
  )
}

/** 見ている日の見出し（`9月24日（水）`。今日・昨日は頭に添え、今年でなければ年も添える）。 */
function dayHeading(daySwitch: AchievementDaySwitch): string {
  if (daySwitch.kind !== "known") {
    return LOADING_VALUE
  }
  const date = Temporal.PlainDate.from(daySwitch.date)
  const today = Temporal.PlainDate.from(daySwitch.today)
  const prefix =
    daySwitch.date === daySwitch.today
      ? "今日 "
      : daySwitch.date === previousDateKey(daySwitch.today)
        ? "昨日 "
        : ""
  const year = date.year === today.year ? "" : `${String(date.year)}年`
  return `${prefix}${year}${dayLabel(date)}`
}

type ContentProps = {
  readonly view: Exclude<AchievementView, { readonly kind: "unavailable" }>
  readonly isFetching: boolean
  readonly review: AchievementReviewButton
}

/**
 * 数の札2枚・終えたタスクの一覧（13.10「並べるもの」2・3、「空の日・数えられないとき」）。
 * **日を切り替えている間は薄く残す**（`isFetching`。13.10「取りに行っている間」）。
 */
function Content(props: ContentProps): ReactElement {
  const dimmed = props.isFetching ? ` ${styles["is-fetching"] ?? ""}` : ""
  const className = `${styles["achievement-content"] ?? ""}${dimmed}`

  if (props.view.kind === "failed") {
    return (
      <div className={className}>
        <p className={styles["achievement-note"]}>{FAILED_NOTE}</p>
      </div>
    )
  }

  if (props.view.kind === "loading") {
    return (
      <div className={className}>
        <div className={styles["achievement-cards"]}>
          <CountCard label="コミット" value={LOADING_VALUE} note="" />
          <CountCard label="終えたタスク" value={LOADING_VALUE} note="" />
        </div>
      </div>
    )
  }

  const { commitCount, doneTasks } = props.view

  return (
    <div className={className}>
      <div className={styles["achievement-cards"]}>
        <CountCard label="コミット" value={String(commitCount)} note="" />
        <CountCard
          label="終えたタスク"
          value={doneTasks.kind === "unknown" ? UNKNOWN_VALUE : String(doneTasks.items.length)}
          note={doneTasks.kind === "unknown" ? UNKNOWN_TASKS_NOTE : ""}
        />
      </div>
      {doneTasks.kind === "unknown" ? null : doneTasks.items.length === 0 ? (
        <p className={styles["achievement-note"]}>
          {commitCount === 0 ? EMPTY_DAY_NOTE : NO_DONE_TASKS_NOTE}
        </p>
      ) : (
        <TaskList items={doneTasks.items} />
      )}
      <ReviewButton review={props.review} />
    </div>
  )
}

/** 「<パックの名前>と振り返る」ボタン（13.10「並べるもの」4）。押せないときは理由を下に添える。 */
function ReviewButton(props: { readonly review: AchievementReviewButton }): ReactElement {
  const { review } = props
  const { availability } = review

  return (
    <div className={styles["achievement-review"]}>
      <button
        type="button"
        className={styles["achievement-review-button"]}
        aria-disabled={availability.kind === "blocked"}
        onClick={review.onReview}
      >
        {review.label}
      </button>
      {availability.kind === "blocked" && availability.reason !== "" ? (
        <p className={styles["achievement-review-note"]}>{availability.reason}</p>
      ) : null}
    </div>
  )
}

type CountCardProps = {
  readonly label: string
  readonly value: string
  /** 数の下に添える一言。空文字なら出さない（「タスクの記録が無い」があるときだけ添える）。 */
  readonly note: string
}

/** 数の札1枚（コミット・終えたタスク。13.10「並べるもの」2）。 */
function CountCard(props: CountCardProps): ReactElement {
  return (
    <section className={styles["achievement-card"]}>
      <h3 className={styles["achievement-card-label"]}>{props.label}</h3>
      <p className={styles["achievement-card-value"]}>{props.value}</p>
      {props.note === "" ? null : <p className={styles["achievement-card-note"]}>{props.note}</p>}
    </section>
  )
}

type TaskListProps = {
  readonly items: readonly AchievementTask[]
}

/** 終えたタスクの一覧（13.10「並べるもの」3）。押せない・並びは ID の数の順（届いた順のまま）。 */
function TaskList(props: TaskListProps): ReactElement {
  return (
    <div className={styles["achievement-tasks"]}>
      <h2 className={styles["achievement-tasks-title"]}>終えたタスク</h2>
      {props.items.map((task) => (
        <div key={task.id} className={styles["achievement-task"]}>
          <span className={styles["achievement-task-id"]}>{task.id}</span>
          <span className={styles["achievement-task-summary"]}>{task.summary}</span>
        </div>
      ))}
    </div>
  )
}
