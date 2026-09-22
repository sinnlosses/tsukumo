// 答え待ちの質問の箱（<QuestionAsk>。docs/design.md 6.1）の**入口**。選択の状態と進み方は
// `hooks/use-question-ask.ts` が持ち、見た目は `presentational-question-ask.tsx` が持つ
// （docs/design.md 2章「機能の中を分ける」の container / presenter）。
//
// **部品として分けてあるのは、選択の状態の寿命をこの箱が出ている間に揃えるため**
// （許可要求から質問へ切り替わったとき、前の選択を引きずらない）。出すかどうかは
// `<PendingAnswer>` が決める。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { type PendingAsk } from "../../../shared/pending-ask.ts"
import { useQuestionAsk } from "./hooks/use-question-ask.ts"
import { PresentationalQuestionAsk } from "./presentational-question-ask.tsx"

export function QuestionAsk(props: {
  readonly pending: Extract<PendingAsk, { readonly kind: "question" }>
}): ReactElement {
  return <PresentationalQuestionAsk {...useQuestionAsk(props.pending)} />
}
