// 段で区切った依頼の手順のまとまり1つ。
//
// 失敗した手順の引数と出力を読める場所はここだけ。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Badge } from "../../components/ui/badge/badge.tsx"
import { CodeBlock } from "../../components/ui/code-block/code-block.tsx"
import { Collapsible } from "../../components/ui/collapsible/collapsible.tsx"
import { CheckIcon, CircleDashedIcon } from "../../components/ui/icon/icon.tsx"
import { List, ListItem } from "../../components/ui/list/list.tsx"
import { Text } from "../../components/ui/text/text.tsx"
import styles from "./current-work-step-group.module.css"
import type {
  CurrentWorkStep,
  CurrentWorkStepGroup as CurrentWorkStepGroupView,
  RunningMark,
} from "./current-work-step.ts"

/** 段で区切った手順のまとまり。段の小見出しがあれば手順の上に置く。 */
export function CurrentWorkStepGroup(props: {
  readonly group: CurrentWorkStepGroupView
  readonly runningMark: RunningMark
}): ReactElement {
  const { group, runningMark } = props
  return (
    <>
      {group.heading.kind === "phase" && (
        <div data-phase-indexes={group.heading.phaseIndexes.join(" ")}>
          <Text
            element="p"
            size="inherit"
            tone="inherit"
            weight="semibold"
            className={styles["current-work-phase-heading"]}
          >
            {group.heading.spanName !== "" && (
              <>
                <span className={styles["current-work-phase-span"]}>
                  {group.heading.spanName}
                </span>{" "}
              </>
            )}
            {group.heading.label}
          </Text>
        </div>
      )}
      <List hasDividers={false} numbered={false} textSize="compact">
        {group.steps.map((step) => (
          <CurrentWorkStepRow key={step.key} step={step} runningMark={runningMark} />
        ))}
      </List>
    </>
  )
}

/** 手順1件。サブエージェントの中（nested）は1段下げる。失敗は札から開いて出力と引数を読める。 */
function CurrentWorkStepRow(props: {
  readonly step: CurrentWorkStep
  readonly runningMark: RunningMark
}): ReactElement {
  const { step, runningMark } = props
  const classes = clsx(
    styles["current-work-step-name"],
    step.status.kind === "done" && styles["current-work-step-done"],
    step.status.kind === "failed" && styles["current-work-step-failed"],
  )

  if (step.failure.kind === "failed") {
    return (
      <ListItem
        label={
          <div
            className={step.nested ? styles["current-work-step-nested"] : ""}
            data-step-failed=""
          >
            <FailureDetail
              nameClassName={classes}
              label={step.label}
              inputText={step.failure.inputText}
              outputText={step.failure.outputText}
            />
          </div>
        }
      />
    )
  }
  return (
    <ListItem
      mark={
        <span
          className={clsx(
            styles["current-work-step-mark"],
            step.status.kind === "running" &&
              runningMark === "spin" &&
              styles["current-work-step-mark-running"],
          )}
          aria-hidden="true"
        >
          {step.status.kind === "running" ? <CircleDashedIcon /> : <CheckIcon />}
        </span>
      }
      label={
        <span className={clsx(classes, step.nested && styles["current-work-step-nested"])}>
          {step.label}
        </span>
      }
    />
  )
}

/** 失敗した手順の中身（引数と出力）。「失敗」の札を印にする（色だけで意味を伝えない）。 */
function FailureDetail(props: {
  readonly nameClassName: string
  readonly label: string
  readonly inputText: string
  readonly outputText: string
}): ReactElement {
  return (
    <Collapsible
      chevronPosition="start"
      defaultOpen={false}
      textSize="label"
      trigger={
        <>
          <Badge tone="ng" shape="pill" className="">
            失敗
          </Badge>{" "}
          <span className={props.nameClassName}>{props.label}</span>
        </>
      }
    >
      {/* 出力が先。開いてまず読みたいのは「何が起きたか」で、引数はその裏取りに使う。 */}
      <CodeBlock code={props.outputText} />
      <CodeBlock code={props.inputText} />
    </Collapsible>
  )
}
