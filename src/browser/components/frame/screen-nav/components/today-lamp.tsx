// 部屋の頭の下の「今日の灯り」。今週7日の狐火（今日に印）と「今日 n つ灯した」を1行に並べ、押すと成果の紙を開く。
// フックも算出も持たず、受け取った値をそのまま置く。数が読めないあいだは何も出さない。

import type { ReactElement } from "react"

import { Lamp } from "../../../ui/lamp/lamp.tsx"
import type { TodayLampView } from "../hooks/use-today-lamp.ts"
import styles from "./today-lamp.module.css"

export function PresentationalTodayLamp(props: { readonly view: TodayLampView }): ReactElement {
  const view = props.view
  if (view.kind === "hidden") {
    return <></>
  }
  return (
    <a className={styles["today-lamp"]} href={view.href} aria-label="今日の灯り。押すと成果を開く">
      <span className={styles["today-lamp-count"]}>
        今日 <b>{view.todayCount} つ</b>灯した
        {view.plus && <span className={styles["today-lamp-plus"]}> ＋1</span>}
      </span>
      <span className={styles["today-lamp-week"]}>
        {view.days.map((day) => (
          <span
            key={day.key}
            className={styles["today-lamp-day"]}
            data-today={day.isToday ? "" : undefined}
          >
            <Lamp kind="level" level={day.level} />
            {day.weekday}
          </span>
        ))}
      </span>
    </a>
  )
}
