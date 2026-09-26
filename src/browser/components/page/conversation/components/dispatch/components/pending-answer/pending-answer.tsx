// 答え待ちの箱（許可要求だけ。<PendingAnswer>）の入口。`<Composer>` の `<textarea>` の上に
// 出す（docs/design.md 6.1）。答え待ちが無いとき・質問のときは何も描かない。答え待ちの先頭を
// 読んで畳むのは `hooks/use-pending-answer.ts`、見た目は `presentational-pending-answer.tsx`
// （docs/design.md 2章「機能の中を分ける」の container / presenter）。
//
// 質問はこの箱に出ない。札はメインビュー
// （`components/page/conversation/components/main-view/components/question-ask/question-ask.tsx`）に出て、自由入力は `<Composer>` が担う。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。条件分岐も算出もここには
// 置かない（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { usePendingAnswer } from "./hooks/use-pending-answer.ts"
import { PresentationalPendingAnswer } from "./presentational-pending-answer.tsx"

export function PendingAnswer(): ReactElement {
  return <PresentationalPendingAnswer {...usePendingAnswer()} />
}
