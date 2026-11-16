// 答えた質問を、右寄せの利用者の投稿として出す入口。

import type { ReactElement } from "react"

import { useAnswerPost, type AnswerPostProps } from "./hooks/use-answer-post.ts"
import { PresentationalAnswerPost } from "./presentational-answer-post.tsx"

export function AnswerPost(props: AnswerPostProps): ReactElement {
  return <PresentationalAnswerPost {...useAnswerPost(props)} />
}
