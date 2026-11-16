// 最終レポートの上の「作業の経過」。

import type { ReactElement } from "react"

import type { TaskSummaryResult } from "../../../../../../shared/repository/task-summary.ts"
import type { MainViewTurn } from "../../../../../../shared/session/main-view-shape.ts"
import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import { foldSummaryOf, type ProgressItem } from "./domain/stream-item-list.ts"
import { FoldedStep } from "./folded-step.tsx"
import styles from "./main-view.module.css"
import { QuestionRecord } from "./question-record.tsx"
import { PlanCard, PostRow, SayRow } from "./stream-card.tsx"

type ProgressFoldProps = {
  readonly items: readonly ProgressItem[]
  readonly turn: MainViewTurn
  readonly tasks: TaskSummaryResult
}

/** 最終レポートの上の「作業の経過」。段の札・セリフ・補足の投稿・質問の記録・本文（1行の畳みの形）を届いた順に入れる。 */
export function ProgressFold(props: ProgressFoldProps): ReactElement {
  const { turn } = props
  return (
    <details className={styles["progress-fold"]}>
      <Text element="summary" size="label" tone="ink-quiet" weight="inherit" className="">
        {foldSummaryOf(props.items)}
      </Text>
      <VStack
        element="div"
        name={{ kind: "none" }}
        gap="md"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["progress-fold-steps"]}
      >
        {props.items.map((item, index) => {
          switch (item.kind) {
            case "plan":
              return <PlanCard record={item.record} key={`plan:${String(index)}`} />
            case "say":
              return <SayRow row={item} key={`say:${String(index)}`} />
            case "post":
              return (
                <PostRow turn={turn} tasks={props.tasks} row={item} key={`post:${String(index)}`} />
              )
            case "question":
              return <QuestionRecord entry={item.entry} key={`question:${item.entry.toolUseId}`} />
            case "body":
              return (
                <FoldedStep
                  step={item.step}
                  turnId={turn.id}
                  hasInterimReport={turn.hasInterimReport}
                  phoneHidden={false}
                  key={`body:${String(item.step.id)}`}
                />
              )
          }
        })}
      </VStack>
    </details>
  )
}
