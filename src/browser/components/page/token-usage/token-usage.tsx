// トークン消費の画面（`#token-usage`）の入口。会話の画面と入れ替わる別の画面で、常駐の3領域には混ぜない。
// 3つの取得が別のフックなのは、出どころが別だから（記録の集計はファイル、内訳はいま動いているセッションの駆動、見直しはサーバの状態）。
//
// 内訳の取り直しの合図（`state.finishedTurnCount`）はここで `useSession` から読んで渡す。
// `useContextUsage` の側はストアを読めないため。

import type { ReactElement } from "react"

import { useContextUsage } from "../../../domain/context-usage.ts"
import { useSession } from "../../../stores/session.ts"
import { useTokenUsage } from "./hooks/use-token-usage.ts"
import { useUsageReview } from "./hooks/use-usage-review.ts"
import { PresentationalTokenUsage } from "./presentational-token-usage.tsx"

export function TokenUsage(): ReactElement {
  const refetchKey = useSession((session) => session.state.finishedTurnCount)
  return (
    <PresentationalTokenUsage
      {...useTokenUsage()}
      contextUsage={useContextUsage(refetchKey)}
      usageReview={useUsageReview()}
    />
  )
}
