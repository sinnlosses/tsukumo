// 日の切り替え。
// 前の日へは制限なく戻れるが、何日を見ているか分からない間（読み込み中・一度も届いていない失敗）は3つとも押せない。
// 前後の日の計算にも「今日へ」の判定にも、直前に届いた日付（`AchievementDaySwitch`）が要るため。

import type { ReactElement } from "react"

import { dayLabel } from "../../../../../utils/day-label.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import type { AchievementDaySwitch } from "../../hooks/use-achievement.ts"
import styles from "./day-switch.module.css"

const LOADING_VALUE = "…"

type DaySwitchProps = {
  readonly daySwitch: AchievementDaySwitch
  readonly onPreviousDay: () => void
  readonly onNextDay: () => void
  readonly onToday: () => void
}

export function DaySwitch(props: DaySwitchProps): ReactElement {
  const { daySwitch } = props
  const known = daySwitch.kind === "known"
  const isToday = known && daySwitch.date === daySwitch.today

  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      gap="lg"
      align="center"
      justify="between"
      wrap="wrap"
      className=""
    >
      <Heading
        level={2}
        size="heading"
        tone="ink"
        weight="normal"
        className={styles["achievement-day-switch-label"]}
      >
        {known ? dateLabel(daySwitch) : LOADING_VALUE}
      </Heading>
      <div className={styles["achievement-day-switch-nav"]}>
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={!known}
          ariaLabel="前の日"
          disclosure={{ kind: "none" }}
          className={styles["achievement-day-switch-button"]}
          onClick={props.onPreviousDay}
        >
          ‹
        </Button>
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={!known || isToday}
          ariaLabel="次の日"
          disclosure={{ kind: "none" }}
          className={styles["achievement-day-switch-button"]}
          onClick={props.onNextDay}
        >
          ›
        </Button>
        {known && !isToday && (
          <Button
            variant="outline"
            size="secondary"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["achievement-day-switch-today"]}
            onClick={props.onToday}
          >
            今日へ
          </Button>
        )}
      </div>
    </HStack>
  )
}

/** 「9月24日（木）」の形。今年でなければ年も添える。 */
function dateLabel(daySwitch: Extract<AchievementDaySwitch, { readonly kind: "known" }>): string {
  const date = Temporal.PlainDate.from(daySwitch.date)
  const today = Temporal.PlainDate.from(daySwitch.today)
  const year = date.year === today.year ? "" : `${String(date.year)}年`
  return `${year}${dayLabel(date)}`
}
