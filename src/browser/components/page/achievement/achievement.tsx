// 成果の画面（`#achievement`）の入口。
// 会話の画面と入れ替わる別の画面で、常駐の3領域には混ぜない。

import type { ReactElement } from "react"

import { useAchievementCalendar } from "./hooks/use-achievement-calendar.ts"
import { useAchievement } from "./hooks/use-achievement.ts"
import { useDiaryBook } from "./hooks/use-diary-book.ts"
import { PresentationalAchievement } from "./presentational-achievement.tsx"

export function Achievement(): ReactElement {
  const achievement = useAchievement()
  const calendar = useAchievementCalendar()
  const diaryBook = useDiaryBook({
    calendar,
    daySwitch: achievement.daySwitch,
    onDateSelected: achievement.onSelectDate,
  })

  return (
    <PresentationalAchievement
      {...achievement}
      calendar={calendar}
      onSelectDate={diaryBook.onOpenFromCalendar}
      onOpenDiaryBook={diaryBook.onOpenFromDiarySection}
      diaryBook={diaryBook}
    />
  )
}
