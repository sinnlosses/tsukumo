// ワークフローの図の下に置く、選んだエージェントの手元。頭（状態の印・名札・種類の全名とモデル・手順の総数）と直近の手順の並び。
// 全部は「手順 n件をすべて見る」で同じ面の中に開く。開いた状態は面を閉じて開き直すと畳んだ姿に戻る。

import { type ReactElement, useState } from "react"

import { Badge } from "../../../../ui/badge/badge.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { List, ListItem } from "../../../../ui/list/list.tsx"
import { StatusDot } from "../../../../ui/status-dot/status-dot.tsx"
import { Surface } from "../../../../ui/surface/surface.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import {
  WORKFLOW_HAND_RECENT,
  type WorkflowAgentHand,
  type WorkflowHandStep,
} from "./domain/workflow-agent-hand.ts"
import type { WorkflowDiagramBoxState } from "./domain/workflow-diagram.ts"
import styles from "./main-view.module.css"

const STATE_DOT = {
  running: "accent",
  done: "ok",
  failed: "ng",
  waiting: "neutral",
  stopped: "neutral",
} as const satisfies Record<WorkflowDiagramBoxState, "accent" | "ok" | "ng" | "neutral">

const STATE_WORD = {
  running: "動いている",
  done: "済み",
  failed: "失敗",
  waiting: "待ち",
  stopped: "止まった",
} satisfies Record<WorkflowDiagramBoxState, string>

const STEP_DOT = {
  running: "accent",
  done: "ok",
  failed: "ng",
} as const satisfies Record<WorkflowHandStep["state"], "accent" | "ok" | "ng">

const STEP_WORD = {
  running: "走っている",
  done: "済み",
  failed: "失敗",
} satisfies Record<WorkflowHandStep["state"], string>

export function PresentationalWorkflowAgentHand(props: {
  readonly hand: WorkflowAgentHand
}): ReactElement {
  const { hand } = props
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? hand.steps : hand.steps.slice(-WORKFLOW_HAND_RECENT)
  const unseen = Math.max(0, hand.total - hand.steps.length)
  return (
    <section aria-label={`${hand.name} の手元`}>
      <Surface
        element="div"
        tone="surface"
        space="sm"
        radius="lg"
        shadow="none"
        className={styles["workflow-hand"]}
      >
        <p className={styles["workflow-hand-head"]}>
          <StatusDot tone={STATE_DOT[hand.state]} label={STATE_WORD[hand.state]} />
          <Text element="span" size="secondary" tone="ink" weight="semibold" className="">
            {hand.name}
          </Text>
          <Badge tone="neutral" shape="square" className="">
            {hand.model === "" ? hand.kind : `${hand.kind} · ${hand.model}`}
          </Badge>
          <Text
            element="span"
            size="label"
            tone="ink-quiet"
            weight="normal"
            className={styles["workflow-hand-total"]}
          >
            手順 {String(hand.total)}
          </Text>
        </p>
        {shown.length > 0 && (
          <List hasDividers={false} numbered={false}>
            {shown.map((step) => (
              <ListItem
                key={step.key}
                mark={<StatusDot tone={STEP_DOT[step.state]} label={STEP_WORD[step.state]} />}
                label={
                  <span
                    className={styles["workflow-hand-step"]}
                    data-running={step.state === "running"}
                  >
                    <Text
                      element="span"
                      size="label"
                      tone="ink-quiet"
                      weight="normal"
                      className={styles["workflow-hand-clock"]}
                    >
                      {step.clock}
                    </Text>
                    <Text
                      element="span"
                      size="label"
                      tone={step.state === "failed" ? "state-ng" : "ink"}
                      weight="normal"
                      className={styles["workflow-hand-what"]}
                    >
                      {step.target === "" ? step.tool : `${step.tool}  ${step.target}`}
                    </Text>
                  </span>
                }
                end={
                  <Text
                    element="span"
                    size="label"
                    tone="ink-quiet"
                    weight="normal"
                    className={styles["workflow-diagram-time"]}
                  >
                    {step.elapsed}
                  </Text>
                }
              />
            ))}
          </List>
        )}
        {!expanded && hand.total > shown.length && (
          <Button
            variant="ghost-hover-rule-soft"
            size="label"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "expander", expanded }}
            className=""
            onClick={() => {
              setExpanded(true)
            }}
          >
            手順 {String(hand.total)}件をすべて見る
          </Button>
        )}
        {expanded && unseen > 0 && (
          <Text element="p" size="label" tone="ink-quiet" weight="normal" className="">
            ほか {String(unseen)}件
          </Text>
        )}
      </Surface>
    </section>
  )
}
