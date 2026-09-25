// 成果の画面（`#achievement`。会話の画面と入れ替わる別の画面で、常駐の3領域には混ぜない）の
// **入口**。1日ぶんの取得と日の切り替えは `hooks/use-achievement.ts`、灯りの暦は
// `hooks/use-achievement-calendar.ts`、見た目は `presentational-achievement.tsx` が持つ
// （docs/design.md 2章「機能の中を分ける」の container / presenter）。
//
// **入る口も会話へ戻る口も、全画面の最上部の帯**（`components/domain/screen-nav/`。13.9）にある。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

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
