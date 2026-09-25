// 小さな驚き（卒業・節目。`docs/screen-design.md` 13.10「並べるもの」4）。**どちらも無い日は
// 見出しごと出さない**。

import { type ReactElement } from "react"

import {
  type AchievementGraduation,
  type AchievementMilestone,
} from "../../../../shared/achievement.ts"
import { Heading } from "../../../components/ui/heading/heading.tsx"
import styles from "./achievement.module.css"

export type SurpriseSectionProps = {
  readonly graduations: readonly AchievementGraduation[]
  readonly milestones: readonly AchievementMilestone[]
}

export function SurpriseSection(props: SurpriseSectionProps): ReactElement | null {
  if (props.graduations.length === 0 && props.milestones.length === 0) {
    return null
  }

  return (
    <section aria-label="小さな驚き" className={styles["achievement-surprise"]}>
      <Heading level={2} size="subheading" tone="ink" weight="bold" className="">
        小さな驚き
        <span className={styles["achievement-surprise-note"]}>この日に起きた特別なこと</span>
      </Heading>
      <div className={styles["achievement-surprise-cards"]}>
        {props.graduations.map((graduation) => (
          <GraduationCard key={graduation.id} graduation={graduation} />
        ))}
        {props.milestones.map((milestone) => (
          <MilestoneCard key={milestoneKey(milestone)} milestone={milestone} />
        ))}
      </div>
    </section>
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
        <span>登録から</span>
        <span className={styles["achievement-surprise-card-number"]}>
          {String(graduation.days)}
        </span>
        <span>日</span>
        <span className={styles["achievement-surprise-card-spacer"]} />
        <span>{monthDayLabel(graduation.registeredOn)}から、おつかれさまでした</span>
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
        <span>通算</span>{" "}
        <span className={styles["achievement-surprise-card-number"]}>{count}</span>{" "}
        <span>{milestone.kind === "task" ? "件目のタスク" : "コミット目"}</span>
      </p>
      <p className={styles["achievement-surprise-card-footer"]}>
        {milestone.kind === "task"
          ? `${milestone.taskId} が ${count} 件目になりました。`
          : `[${milestone.time}] のコミットが ${count} 件目になりました。`}
      </p>
    </article>
  )
}

function milestoneKey(milestone: AchievementMilestone): string {
  return milestone.kind === "task" ? `task-${milestone.taskId}` : `commit-${milestone.time}`
}

/** 「9月12日」の形（曜日は付けない。`day-switch.tsx` の「今日」「昨日」は要らないので別に持つ）。 */
function monthDayLabel(dateKey: string): string {
  const date = Temporal.PlainDate.from(dateKey)
  return `${String(date.month)}月${String(date.day)}日`
}

/** 3桁ごとに区切る（`docs/screen-design.md` 13.10「並べるもの」4「節目」）。 */
function groupedNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value)
}
