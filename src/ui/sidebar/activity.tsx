// サイドバーの「いま何をしているか」。**実行中が先（普通の色）、直近の完了がその下（薄い色）**
// （docs/requirements.md 4.2 の決定）。両方空のときだけ空であることを出す。

import { type ReactElement } from "react"

import { type ToolActivity } from "../../protocol/session-state.ts"
import { summarizeToolInput } from "../component/tool-summary.ts"

export type ActivityProps = {
  /** 実行中のツール（新しい順）。 */
  readonly running: readonly ToolActivity[]
  /** 直近に使い終えたツール（新しい順）。 */
  readonly finished: readonly ToolActivity[]
}

export function Activity(props: ActivityProps): ReactElement {
  if (props.running.length === 0 && props.finished.length === 0) {
    return <p className="sidebar-empty">いま動いているツールは無い</p>
  }

  return (
    <ul className="sidebar-list activity-list">
      {props.running.map((activity) => (
        <ActivityItem key={activity.toolUseId} activity={activity} finished={false} />
      ))}
      {props.finished.map((activity) => (
        <ActivityItem key={activity.toolUseId} activity={activity} finished={true} />
      ))}
    </ul>
  )
}

/**
 * 実行中・完了1件分。**サブエージェントの中（`nested`）は1段下げて出す。** 要約は
 * `summarizeToolInput`（protocol。許可要求の要約と同じ関数。同じ概念を2箇所で別に決めない）。
 */
function ActivityItem(props: {
  readonly activity: ToolActivity
  readonly finished: boolean
}): ReactElement {
  const summary = summarizeToolInput(props.activity.name, props.activity.input)
  const label = summary === "" ? props.activity.name : `${props.activity.name}: ${summary}`
  const classes = [
    "activity-item",
    props.finished ? "activity-finished" : "activity-running",
    props.activity.nested ? "activity-nested" : "",
  ]
    .filter((name) => name !== "")
    .join(" ")

  return <li className={classes}>{label}</li>
}
