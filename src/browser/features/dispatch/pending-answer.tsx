// 答え待ちの箱（許可要求・質問。<PendingAnswer>）の**入口**。`<Composer>` の `<textarea>` の上に
// 出す（docs/design.md 6.1）。答え待ちが無いときは何も描かない。答え待ちの先頭を読んで畳むのは
// `hooks/use-pending-answer.ts`、見た目は `presentational-pending-answer.tsx`（docs/design.md 2章
// 「機能の中を分ける」の container / presenter）。
//
// 質問の箱（1問ずつ出す・複数選択・自由入力・辞書順・送る labels の形）は `question-ask.tsx` と
// `hooks/use-question-ask.ts` にある。**何問目を見ているか・どの選択肢に目を置いているかは
// `stores/question-focus.tsx` が配る**（メインビューの比較 `features/main-view/pending-question.tsx`
// と同じ選択に従うため）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { usePendingAnswer } from "./hooks/use-pending-answer.ts"
import { PresentationalPendingAnswer } from "./presentational-pending-answer.tsx"

export function PendingAnswer(): ReactElement {
  return <PresentationalPendingAnswer {...usePendingAnswer()} />
}
