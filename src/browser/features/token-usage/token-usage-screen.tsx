// トークン消費の画面（`#token-usage`。会話の画面と入れ替わる別の画面で、常駐の3領域には
// 混ぜない）の**入口**。取得と期間の選択は `hooks/use-token-usage.ts`、いまのコンテキストの
// 内訳は `hooks/use-context-usage.ts`、「減らし方を見てもらう」区画は
// `hooks/use-usage-review.ts` が持ち、見た目は `presentational-token-usage-screen.tsx` が持つ
// （docs/design.md 2章「機能の中を分ける」の container / presenter）。**3つの取得が別の
// フックなのは、出どころが別だから**（記録の集計はファイル、内訳はいま動いているセッションの
// 駆動、見直しはサーバの状態）。
//
// **入る口も会話へ戻る口も、全画面の最上部の帯**（`features/screen-nav/`。13.9）にある。
// **期間の既定は7日**で、30日にも切り替えられる（`src/shared/token-usage-summary.ts`）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useContextUsage } from "./hooks/use-context-usage.ts"
import { useTokenUsage } from "./hooks/use-token-usage.ts"
import { useUsageReview } from "./hooks/use-usage-review.ts"
import { PresentationalTokenUsageScreen } from "./presentational-token-usage-screen.tsx"

export function TokenUsageScreen(): ReactElement {
  return (
    <PresentationalTokenUsageScreen
      {...useTokenUsage()}
      contextUsage={useContextUsage()}
      usageReview={useUsageReview()}
    />
  )
}
