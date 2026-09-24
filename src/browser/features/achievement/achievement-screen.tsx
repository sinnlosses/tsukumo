// 成果の画面（`#achievement`。会話の画面と入れ替わる別の画面で、常駐の3領域には混ぜない）の
// **入口**。取得と日の切り替えは `hooks/use-achievement.ts`、見た目は
// `presentational-achievement-screen.tsx` が持つ（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。
//
// **入る口も会話へ戻る口も、全画面の最上部の帯**（`features/screen-nav/`。13.9）にある。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useAchievement } from "./hooks/use-achievement.ts"
import { PresentationalAchievementScreen } from "./presentational-achievement-screen.tsx"

export function AchievementScreen(): ReactElement {
  return <PresentationalAchievementScreen {...useAchievement()} />
}
