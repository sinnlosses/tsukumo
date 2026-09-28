// メインビューに残す質問の記録の入口。「何を聞いて、どう答えたか」を1つの塊で出す。

import type { ReactElement } from "react"

import { useQuestionRecord, type QuestionRecordProps } from "./hooks/use-question-record.ts"
import { PresentationalQuestionRecord } from "./presentational-question-record.tsx"

export type { QuestionRecordProps } from "./hooks/use-question-record.ts"

export function QuestionRecord(props: QuestionRecordProps): ReactElement {
  return <PresentationalQuestionRecord {...useQuestionRecord(props)} />
}
