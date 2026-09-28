// 答え待ちの箱（許可要求だけ）の入口。`<Composer>` の `<textarea>` の上に出す。
// 質問はこの箱に出ない（札はメインビューに出て、自由入力は `<Composer>` が担う）。

import type { ReactElement } from "react"

import { usePendingAnswer } from "./hooks/use-pending-answer.ts"
import { PresentationalPendingAnswer } from "./presentational-pending-answer.tsx"

export function PendingAnswer(): ReactElement {
  return <PresentationalPendingAnswer {...usePendingAnswer()} />
}
