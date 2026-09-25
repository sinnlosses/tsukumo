// 着手と依存の列。**`todo` は着手できるかを出し**（READY / 止めている依存のID。済んだ依存は
// 着手の判断に要らないので出さない）、**判定しない status は依存をそのまま並べる**。
// **色だけで伝えない**ので READY / 待ち の文字も出す。

import { type ReactElement } from "react"

import { type TaskReadiness } from "../../../../shared/task-summary.ts"
import { Text } from "../../../components/ui/text/text.tsx"
import { TaskIdList } from "./task-id-list.tsx"

export function ReadinessCell(props: {
  readonly readiness: TaskReadiness | undefined
  readonly dependencies: readonly string[]
}): ReactElement {
  if (props.readiness === undefined) {
    return props.dependencies.length === 0 ? <>—</> : <TaskIdList ids={props.dependencies} />
  }
  if (props.readiness.kind === "ready") {
    return (
      <Text element="span" size="inherit" tone="state-ok" weight="inherit" className="">
        READY
      </Text>
    )
  }

  return (
    <Text element="span" size="inherit" tone="state-warn" weight="inherit" className="">
      {"待ち: "}
      <TaskIdList ids={props.readiness.blockedBy} />
    </Text>
  )
}
