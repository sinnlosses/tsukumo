// トークン消費の画面の器。
//
// 数そのものを読ませたいところは表、大小と傾きを見せたいところは棒。
// モード別（仕事/雑談）と1ターンあたりの中央値は、見ても減らす手が変わらないので出さない。
//
// 画面に会話の文面は出ない（集計にそもそも文面が入っていない。`TokenUsageSummary`）。

import type { ReactElement } from "react"

import type { UseContextUsageResult } from "../../../domain/context-usage.ts"
import { HStack } from "../../ui/h-stack/h-stack.tsx"
import { Text } from "../../ui/text/text.tsx"
import { VStack } from "../../ui/v-stack/v-stack.tsx"
import { ContextUsageCard } from "./components/context-usage-card/context-usage-card.tsx"
import { ModelUsageCard } from "./components/model-usage-card/model-usage-card.tsx"
import { PeriodChoices } from "./components/period-choices/period-choices.tsx"
import { PeriodUsageCard } from "./components/period-usage-card/period-usage-card.tsx"
import { ToolUsageCard } from "./components/tool-usage-card/tool-usage-card.tsx"
import { UsageReviewCard } from "./components/usage-review-card/usage-review-card.tsx"
import type { UseTokenUsageResult } from "./hooks/use-token-usage.ts"
import type { UseUsageReviewResult } from "./hooks/use-usage-review.ts"
import styles from "./token-usage.module.css"

/** 記録が1件も無い期間の一言（空でも壊れない。札も表も出さずこれだけ）。 */
const EMPTY_NOTE = "この期間の記録はまだ無い"

/** 集計を取れなかったときの一言（記録が無いときと区別する）。 */
const FAILED_NOTE = "集計を取れなかった"

export type PresentationalTokenUsageProps = UseTokenUsageResult & {
  /** いまのコンテキストの内訳。 */
  readonly contextUsage: UseContextUsageResult
  /** 「減らし方を見てもらう」区画。 */
  readonly usageReview: UseUsageReviewResult
}

export function PresentationalTokenUsage(props: PresentationalTokenUsageProps): ReactElement {
  const { report } = props

  return (
    <div className={styles["token-usage"]}>
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="md"
        align="baseline"
        justify="start"
        wrap="wrap"
        className=""
      >
        <h1 className={styles["token-usage-title"]}>トークン消費</h1>
        {props.plan !== undefined && (
          <Text
            element="span"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["token-usage-plan"]}
          >
            {props.plan}
          </Text>
        )}
        <div className={styles["token-usage-bar-spacer"]} />
        {props.usageReview.kind === "running" && (
          <span className={styles["token-usage-review-badge"]} role="status">
            見直し中
          </span>
        )}
      </HStack>

      <UsageReviewCard review={props.usageReview} />

      <ContextUsageCard card={props.contextUsage} />

      <VStack
        element="section"
        name={{ kind: "none" }}
        ref={undefined}
        gap="sm"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className=""
      >
        <HStack
          element="div"
          name={{ kind: "none" }}
          ref={undefined}
          gap="sm"
          align="baseline"
          justify="start"
          wrap="wrap"
          className=""
        >
          <h2 className={styles["token-usage-section-label"]}>期間の消費</h2>
          <PeriodChoices choices={props.periodChoices} onDaysChange={props.onDaysChange} />
        </HStack>
        {report.kind === "failed" && (
          <Text element="p" size="label" tone="ink-quiet" weight="inherit" className="">
            {FAILED_NOTE}
          </Text>
        )}
        {report.kind === "empty" && (
          <Text element="p" size="label" tone="ink-quiet" weight="inherit" className="">
            {EMPTY_NOTE}
          </Text>
        )}
        {report.kind === "ready" && (
          <div className={styles["usage-card-row"]}>
            {report.periodCards.map((card) => (
              <PeriodUsageCard
                key={card.label}
                label={card.label}
                value={card.value}
                trend={report.trend}
                pick={card.pick}
              />
            ))}
          </div>
        )}
      </VStack>

      {report.kind === "ready" && (
        <div className={styles["usage-table-row"]}>
          <ModelUsageCard models={report.models} />
          <ToolUsageCard tools={report.tools} />
        </div>
      )}
    </div>
  )
}
