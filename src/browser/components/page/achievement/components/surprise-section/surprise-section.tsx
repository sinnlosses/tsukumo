// 小さな驚き（卒業・節目）。どちらも無い日は見出しごと出さない。

import type { ReactElement } from "react"

import type {
  AchievementGraduation,
  AchievementMilestone,
} from "../../../../../../shared/achievement/achievement.ts"
import { monthDayLabel } from "../../../../../utils/month-day-label.ts"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import styles from "./surprise-section.module.css"

export type SurpriseSectionProps = {
  readonly graduations: readonly AchievementGraduation[]
  readonly milestones: readonly AchievementMilestone[]
}

export function SurpriseSection(props: SurpriseSectionProps): ReactElement | null {
  if (props.graduations.length === 0 && props.milestones.length === 0) {
    return null
  }

  return (
    <VStack
      element="section"
      name={{ kind: "label", label: "小さな驚き" }}
      ref={undefined}
      gap="md"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className=""
    >
      <Heading level={2} size="subheading" tone="ink" weight="bold" className="">
        小さな驚き
        <Text
          element="span"
          size="secondary"
          tone="ink-quiet"
          weight="normal"
          className={styles["achievement-surprise-note"]}
        >
          この日に起きた特別なこと
        </Text>
      </Heading>
      <div className={styles["achievement-surprise-cards"]}>
        {props.graduations.map((graduation) => (
          <GraduationCard key={graduation.id} graduation={graduation} />
        ))}
        {props.milestones.map((milestone) => (
          <MilestoneCard key={milestone.taskId} milestone={milestone} />
        ))}
      </div>
    </VStack>
  )
}

function GraduationCard(props: { readonly graduation: AchievementGraduation }): ReactElement {
  const { graduation } = props
  return (
    <article className={styles["achievement-surprise-card"]}>
      <p className={styles["achievement-surprise-card-title"]}>先輩タスクの卒業</p>
      <p className={styles["achievement-surprise-card-body"]}>
        <span className={styles["achievement-surprise-card-id"]}>{graduation.id}</span>
        {graduation.summary}
      </p>
      <p className={styles["achievement-surprise-card-footer"]}>
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          登録から
        </Text>
        <span className={styles["achievement-surprise-card-number"]}>
          {String(graduation.days)}
        </span>
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          日
        </Text>
        <span className={styles["achievement-surprise-card-spacer"]} />
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          {monthDayLabel(Temporal.PlainDate.from(graduation.registeredOn))}から、おつかれさまでした
        </Text>
      </p>
    </article>
  )
}

function MilestoneCard(props: { readonly milestone: AchievementMilestone }): ReactElement {
  const { milestone } = props
  const count = groupedNumber(milestone.count)
  return (
    <article className={styles["achievement-surprise-card"]}>
      <p className={styles["achievement-surprise-card-title"]}>節目</p>
      <p className={styles["achievement-surprise-card-body"]}>
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          通算
        </Text>{" "}
        <span className={styles["achievement-surprise-card-number"]}>{count}</span>{" "}
        <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
          件目のタスク
        </Text>
      </p>
      <p className={styles["achievement-surprise-card-footer"]}>
        {`${milestone.taskId} が ${count} 件目になりました。`}
      </p>
    </article>
  )
}

/** 3桁ごとに区切る。 */
function groupedNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value)
}
