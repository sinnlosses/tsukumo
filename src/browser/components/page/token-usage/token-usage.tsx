// トークン消費の画面（`#token-usage`。会話の画面と入れ替わる別の画面で、常駐の3領域には
// 混ぜない）の入口。取得と期間の選択は `hooks/use-token-usage.ts`、いまのコンテキストの
// 内訳は `browser/domain/context-usage.ts`（サイドバーの使用量の行と2つの機能が読むので
// 機能の外にある）、「減らし方を見てもらう」区画は `hooks/use-usage-review.ts` が持ち、
// 見た目は `presentational-token-usage.tsx` が持つ
// （docs/design.md 2章「機能の中を分ける」の container / presenter）。3つの取得が別の
// フックなのは、出どころが別だから（記録の集計はファイル、内訳はいま動いているセッションの
// 駆動、見直しはサーバの状態）。
//
// 入る口も会話へ戻る口も、全画面の最上部の帯（`components/domain/screen-nav/`。13.9）にある。
// 期間の既定は7日で、30日にも切り替えられる（`src/shared/token-usage-summary.ts`）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。条件分岐も算出もここには
// 置かない（増えたらフックか見た目のどちらかに寄せる）。`state.lastTurnFinishedAt` を
// 読んで内訳の取り直しの合図を作るのはここ——`browser/domain/` は `stores/` を読めないので
// （`contextUsageRefetchKey` の冒頭コメント）、`useSessionSelector` はここで呼ぶ。

import { type ReactElement } from "react"

import { contextUsageRefetchKey, useContextUsage } from "../../../domain/context-usage.ts"
import { useSessionSelector } from "../../../stores/session.tsx"
import { useTokenUsage } from "./hooks/use-token-usage.ts"
import { useUsageReview } from "./hooks/use-usage-review.ts"
import { PresentationalTokenUsage } from "./presentational-token-usage.tsx"

export function TokenUsage(): ReactElement {
  const refetchKey = useSessionSelector((session) =>
    contextUsageRefetchKey(session.state.lastTurnFinishedAt),
  )
  return (
    <PresentationalTokenUsage
      {...useTokenUsage()}
      contextUsage={useContextUsage(refetchKey)}
      usageReview={useUsageReview()}
    />
  )
}
