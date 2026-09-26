// メインビューに残す質問の記録（`<QuestionRecord>`）の入口。「何を聞いて、どう答えたか」
// を1つの塊で出す。
//
// 選択肢との突き合わせ・比べた `preview` の畳み込みと開閉は `hooks/use-question-record.ts` が持ち、
// 見た目は `presentational-question-record.tsx` が持つ（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。条件分岐も算出もここには
// 置かない（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useQuestionRecord, type QuestionRecordProps } from "./hooks/use-question-record.ts"
import { PresentationalQuestionRecord } from "./presentational-question-record.tsx"

export type { QuestionRecordProps } from "./hooks/use-question-record.ts"

export function QuestionRecord(props: QuestionRecordProps): ReactElement {
  return <PresentationalQuestionRecord {...useQuestionRecord(props)} />
}
