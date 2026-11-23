// 「手順」の全体の詳細の頭に置く、ワークフロースクリプトの図。列はフェーズ、箱はエージェント1つ。
// 箱・印・件数・札は `ui/` の部品で描き、自前で描くのは矢印と始まりの点の SVG と、箱を列に置く並びだけ。
// 矢印の座標は箱を置いたあとに `[data-diagram-end]` の矩形を測って決める（DOM を読むのは `useArrowPaths` の1か所）。

import { type ReactElement, type RefCallback, useId, useRef, useState } from "react"
import { isDeepEqual } from "remeda"

import type { TaskId } from "../../../../../../shared/session-driver/task-id.ts"
import { formatElapsed } from "../../../../../../shared/utils/elapsed-time.ts"
import { useBeforePaintSync } from "../../../../../hooks/use-before-paint-sync.ts"
import { useResizeObservedRef } from "../../../../../hooks/use-observed-ref.ts"
import { Badge } from "../../../../ui/badge/badge.tsx"
import { ClickableCard } from "../../../../ui/clickable-card/clickable-card.tsx"
import { StatusDot } from "../../../../ui/status-dot/status-dot.tsx"
import { Surface } from "../../../../ui/surface/surface.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import {
  type WorkflowAgentCount,
  type WorkflowArrowPath,
  type WorkflowDiagramRect,
  workflowArrowPathsOf,
  workflowBoxLabelOf,
  workflowBoxNoteOf,
  workflowDiagramEndKeyOf,
  workflowIsCurrentColumn,
  type WorkflowSpanTick,
  workflowSpanScaleOf,
  workflowUpcomingNoteOf,
  columnKeysOf,
} from "./domain/workflow-diagram-view.ts"
import type {
  WorkflowDiagram,
  WorkflowDiagramArrow,
  WorkflowDiagramArrowKind,
  WorkflowDiagramBox,
  WorkflowDiagramBoxState,
  WorkflowDiagramColumn,
} from "./domain/workflow-diagram.ts"
import type { WorkStripSteps, WorkStripWorkflow } from "./hooks/use-work-strip-step-list.ts"
import styles from "./main-view.module.css"
import { PresentationalWorkflowAgentHand } from "./presentational-workflow-agent-hand.tsx"

type BoxTone = "plain" | "accent" | "danger" | "dashed"

const BOX_TONE = {
  running: "accent",
  failed: "danger",
  waiting: "dashed",
  done: "plain",
  stopped: "plain",
} satisfies Record<WorkflowDiagramBoxState, BoxTone>

const DOT_TONE = {
  running: "accent",
  done: "ok",
  failed: "ng",
  waiting: "neutral",
  stopped: "neutral",
} as const satisfies Record<WorkflowDiagramBoxState, "accent" | "ok" | "ng" | "neutral">

const COUNT_TONE = {
  running: "accent",
  done: "ok",
  failed: "ng",
  waiting: "neutral",
  stopped: "warn",
} as const satisfies Record<WorkflowDiagramBoxState, "accent" | "ok" | "ng" | "neutral" | "warn">

const ARROW_MARKER = {
  sentBack: "back",
  toRunning: "live",
  toWaiting: "quiet",
  settled: "quiet",
  toUpcoming: "quiet",
} as const satisfies Record<WorkflowDiagramArrowKind, "back" | "live" | "quiet">

/** ワークフロースクリプトの図を新しい順に並べる。無ければ何も出さない。 */
export function PresentationalWorkflowDiagrams(props: {
  readonly steps: WorkStripSteps
}): ReactElement {
  const { steps } = props
  return (
    <>
      {steps.workflows.map((workflow) => (
        <WorkflowItem key={workflow.taskId} workflow={workflow} steps={steps} />
      ))}
    </>
  )
}

function WorkflowItem(props: {
  readonly workflow: WorkStripWorkflow
  readonly steps: WorkStripSteps
}): ReactElement {
  const { workflow, steps } = props
  const { view } = workflow
  if (view.kind === "folded") {
    const label = [workflow.name, `エージェント ${String(view.agentCount)} 件`, view.duration]
      .filter((part) => part !== "")
      .join("、")
    return (
      <div className={styles["workflow-diagram-folded"]}>
        <ClickableCard
          label={label}
          tone="plain"
          onClick={() => {
            steps.onOpenRun(workflow.taskId)
          }}
          className=""
        >
          <span className={styles["workflow-diagram-row"]}>
            <Text
              element="span"
              size="secondary"
              tone="ink"
              weight="semibold"
              className={styles["workflow-diagram-name"]}
            >
              {workflow.name}
            </Text>
            <Text element="span" size="label" tone="ink-quiet" weight="normal" className="">
              エージェント {String(view.agentCount)} 件
            </Text>
            {view.duration !== "" && (
              <Text
                element="span"
                size="label"
                tone="ink-quiet"
                weight="normal"
                className={styles["workflow-diagram-time"]}
              >
                {view.duration}
              </Text>
            )}
          </span>
        </ClickableCard>
      </div>
    )
  }
  return (
    <section aria-label={`${workflow.name} の図`} className={styles["workflow-diagram"]}>
      <p className={styles["workflow-diagram-head"]}>
        <Text
          element="span"
          size="secondary"
          tone="ink"
          weight="semibold"
          className={styles["workflow-diagram-name"]}
        >
          {workflow.name}
        </Text>
        <CountBadges counts={workflow.counts} />
      </p>
      <DiagramStage
        taskId={workflow.taskId}
        diagram={view.diagram}
        columnDurations={view.columnDurations}
        finished={view.finished}
        {...(view.planCurrentKey === undefined ? {} : { planCurrentKey: view.planCurrentKey })}
        selectedIndex={view.hand?.index}
        steps={steps}
      />
      {view.hand !== undefined && (
        <PresentationalWorkflowAgentHand key={view.hand.index} hand={view.hand} />
      )}
    </section>
  )
}

function CountBadges(props: { readonly counts: readonly WorkflowAgentCount[] }): ReactElement {
  return (
    <span className={styles["workflow-diagram-counts"]}>
      {props.counts.map((count) => (
        <Badge key={count.state} tone={COUNT_TONE[count.state]} shape="pill" className="">
          {count.label}
        </Badge>
      ))}
    </span>
  )
}

function DiagramStage(props: {
  readonly taskId: TaskId
  readonly diagram: WorkflowDiagram
  readonly columnDurations: ReadonlyMap<string, string>
  readonly finished: boolean
  readonly planCurrentKey?: string
  readonly selectedIndex?: number
  readonly steps: WorkStripSteps
}): ReactElement {
  const { diagram, steps, taskId } = props
  const { ref, paths } = useArrowPaths(diagram)
  const markerId = useId()
  const hasStart = diagram.arrows.some((arrow) => arrow.from.kind === "start")
  return (
    <div
      ref={ref}
      className={styles["workflow-diagram-stage"]}
      data-has-start={hasStart}
      data-has-folded={diagram.foldedPhases !== undefined}
      style={{ "--diagram-steps": String(stepsTotalOf(diagram)) }}
    >
      <svg aria-hidden="true" className={styles["workflow-diagram-arrows"]}>
        <defs>
          {(["back", "live", "quiet"] as const).map((marker) => (
            <marker
              key={marker}
              id={`${markerId}-${marker}`}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
              className={styles["workflow-diagram-marker"]}
              data-marker={marker}
            >
              <path d="M0 0 L8 4 L0 8 z" />
            </marker>
          ))}
        </defs>
        {paths.map((path) => (
          <path
            key={path.key}
            d={path.d}
            className={styles["workflow-diagram-arrow"]}
            data-arrow={path.kind}
            markerEnd={`url(#${markerId}-${ARROW_MARKER[path.kind]})`}
          />
        ))}
      </svg>
      {hasStart && (
        <svg
          aria-hidden="true"
          viewBox="0 0 10 10"
          className={styles["workflow-diagram-start"]}
          data-diagram-end="start"
        >
          <circle cx="5" cy="5" r="5" />
        </svg>
      )}
      {diagram.foldedPhases !== undefined && (
        <div className={styles["workflow-diagram-folded-column"]}>
          <div data-diagram-end="folded">
            <ClickableCard
              label={`済んだ ${String(diagram.foldedPhases.count)} フェーズ`}
              tone="plain"
              onClick={steps.onUnfoldPhases}
              className=""
            >
              <Text element="span" size="label" tone="ink-quiet" weight="normal" className="">
                済んだ {String(diagram.foldedPhases.count)} フェーズ
              </Text>
            </ClickableCard>
          </div>
        </div>
      )}
      {diagram.columns.map((column, position) => {
        const current = workflowIsCurrentColumn(
          column,
          diagram.columns,
          props.finished,
          props.planCurrentKey,
        )
        return (
          <Column
            key={column.key}
            taskId={taskId}
            column={column}
            start={stepStartOf(diagram, position)}
            columnDurations={props.columnDurations}
            current={current}
            finished={props.finished}
            upcomingNote={workflowUpcomingNoteOf(props.finished, current)}
            selectedIndex={props.selectedIndex}
            steps={steps}
            {...(props.planCurrentKey === undefined
              ? {}
              : { planCurrentKey: props.planCurrentKey })}
          />
        )
      })}
      {paths.flatMap((path) =>
        path.labelAt === undefined
          ? []
          : [
              <span
                key={`label-${path.key}`}
                className={styles["workflow-diagram-arrow-label"]}
                style={{
                  "--arrow-label-x": `${String(path.labelAt.x)}px`,
                  "--arrow-label-y": `${String(path.labelAt.y)}px`,
                }}
              >
                <Text element="span" size="label" tone="state-warn" weight="normal" className="">
                  差し戻し
                </Text>
              </span>,
            ],
      )}
    </div>
  )
}

/** 図の段の数。範囲の列は受け持った段の数で数える。 */
function stepsTotalOf(diagram: WorkflowDiagram): number {
  return diagram.columns.reduce((sum, column) => sum + columnKeysOf(column).length, 0)
}

/** 列の最初の段の格子の位置（1始まり。「済んだ n フェーズ」の列があれば先頭の1つを譲る）。 */
function stepStartOf(diagram: WorkflowDiagram, position: number): number {
  return (
    (diagram.foldedPhases === undefined ? 1 : 2) +
    diagram.columns.slice(0, position).reduce((sum, column) => sum + columnKeysOf(column).length, 0)
  )
}

function Column(props: {
  readonly taskId: TaskId
  readonly column: WorkflowDiagramColumn
  readonly start: number
  readonly columnDurations: ReadonlyMap<string, string>
  readonly current: boolean
  readonly finished: boolean
  readonly planCurrentKey?: string
  readonly upcomingNote: string
  readonly selectedIndex?: number
  readonly steps: WorkStripSteps
}): ReactElement {
  const { column, current, steps, taskId } = props
  const keys = columnKeysOf(column)
  const planHere = props.planCurrentKey !== undefined && keys.includes(props.planCurrentKey)
  return (
    <>
      {keys.map((key, offset) => {
        const headCurrent = planHere ? key === props.planCurrentKey : offset === 0 && current
        const duration = props.columnDurations.get(key) ?? ""
        return (
          <p
            key={key}
            className={styles["workflow-diagram-column-head"]}
            data-current={headCurrent}
            style={{ "--step-start": String(props.start + offset) }}
          >
            <Text
              element="span"
              size="label"
              tone={headCurrent ? "ink" : "ink-quiet"}
              weight={headCurrent ? "semibold" : "normal"}
              className={styles["workflow-diagram-name"]}
            >
              {offset === 0 ? column.name : key}
            </Text>
            {duration !== "" && (
              <Text
                element="span"
                size="label"
                tone="ink-quiet"
                weight="normal"
                className={styles["workflow-diagram-time"]}
              >
                {duration}
              </Text>
            )}
          </p>
        )
      })}
      <div
        className={styles["workflow-diagram-column"]}
        style={{
          "--step-start": String(props.start),
          "--step-span": String(keys.length),
        }}
      >
        {column.kind === "upcoming" ? (
          <div data-diagram-end={workflowDiagramEndKeyOf({ kind: "upcoming", column: column.key })}>
            <Surface
              element="div"
              tone="surface"
              space="sm"
              radius="lg"
              shadow="none"
              className={styles["workflow-diagram-upcoming"]}
            >
              <Text element="span" size="label" tone="ink-quiet" weight="normal" className="">
                {column.name} · {props.upcomingNote}
              </Text>
            </Surface>
          </div>
        ) : (
          <>
            {column.boxes.map((box) => (
              <AgentBox
                key={box.index}
                box={box}
                scale={workflowSpanScaleOf(box.state, keys, props.finished, props.planCurrentKey)}
                pressed={box.index === props.selectedIndex}
                onPress={() => {
                  steps.onAgentPress(taskId, box.index)
                }}
              />
            ))}
            {column.others !== undefined && (
              <div
                data-diagram-end={workflowDiagramEndKeyOf({ kind: "others", column: column.key })}
              >
                <ClickableCard
                  label={`ほか ${String(column.others.count)} 件`}
                  tone="plain"
                  onClick={() => {
                    steps.onUnfoldColumn(column.key)
                  }}
                  className=""
                >
                  <Text element="span" size="label" tone="ink-quiet" weight="normal" className="">
                    ほか {String(column.others.count)} 件
                  </Text>
                </ClickableCard>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

const SCALE_MARK = { done: " ✓", now: " · いま", next: "" } as const

function AgentBox(props: {
  readonly box: WorkflowDiagramBox
  readonly scale: readonly WorkflowSpanTick[]
  readonly pressed: boolean
  readonly onPress: () => void
}): ReactElement {
  const { box } = props
  const note = workflowBoxNoteOf(box)
  const typeName = box.hidesType ? undefined : box.typeName
  const label = workflowBoxLabelOf(box)
  return (
    <div data-diagram-end={workflowDiagramEndKeyOf({ kind: "agent", index: box.index })}>
      <ClickableCard
        label={label}
        tone={BOX_TONE[box.state]}
        pressed={props.pressed}
        onClick={props.onPress}
        className=""
      >
        <span className={styles["workflow-diagram-row"]}>
          <StatusDot tone={DOT_TONE[box.state]} label={label} />
          <span title={box.name} className={styles["workflow-diagram-name"]}>
            <Text element="span" size="label" tone="ink" weight="semibold" className="">
              {box.name}
            </Text>
          </span>
          {box.elapsedMs !== undefined && (
            <Text
              element="span"
              size="label"
              tone="ink-quiet"
              weight="normal"
              className={styles["workflow-diagram-time"]}
            >
              {formatElapsed(Math.round(box.elapsedMs / 1000))}
            </Text>
          )}
        </span>
        {(typeName !== undefined || note !== "") && (
          <span className={styles["workflow-diagram-row"]}>
            {typeName !== undefined && (
              <Badge tone="neutral" shape="square" className="">
                {typeName}
              </Badge>
            )}
            {note !== "" && (
              <Text
                element="span"
                size="label"
                tone={box.state === "failed" ? "state-ng" : "ink-quiet"}
                weight="normal"
                className={styles["workflow-diagram-note"]}
              >
                {note}
              </Text>
            )}
          </span>
        )}
        {props.scale.length > 0 && (
          <span
            className={styles["workflow-diagram-scale"]}
            style={{ "--scale-steps": String(props.scale.length) }}
          >
            {props.scale.map((tick) => (
              <span
                key={tick.key}
                className={styles["workflow-diagram-tick"]}
                data-tick={tick.state}
              >
                <span className={styles["workflow-diagram-tick-bar"]} />
                <Text
                  element="span"
                  size="label"
                  tone={tick.state === "now" ? "accent" : "ink-quiet"}
                  weight="normal"
                  className={styles["workflow-diagram-name"]}
                >
                  {tick.key}
                  {SCALE_MARK[tick.state]}
                </Text>
              </span>
            ))}
          </span>
        )}
      </ClickableCard>
    </div>
  )
}

/**
 * 図の根に付ける ref と、測った矢印の線。根の寸法が変わったときと、図の形が変わったとき（畳みを開いたとき）の描画の前に測り直す。
 */
function useArrowPaths(diagram: WorkflowDiagram): {
  readonly ref: RefCallback<HTMLDivElement>
  readonly paths: readonly WorkflowArrowPath[]
} {
  const rootRef = useRef<HTMLDivElement>(undefined)
  const [paths, setPaths] = useState<readonly WorkflowArrowPath[]>([])
  const { arrows } = diagram
  const observedRef = useResizeObservedRef<HTMLDivElement>(
    (element) => {
      rootRef.current = element
      setPaths(replacedIfChanged(arrowPathsIn(element, arrows)))
    },
    () => {
      rootRef.current = undefined
    },
  )
  useBeforePaintSync(() => {
    const root = rootRef.current
    if (root === undefined) {
      return
    }
    setPaths(replacedIfChanged(arrowPathsIn(root, arrows)))
  }, [arrows])
  return { ref: observedRef, paths }
}

/** 測り直した線が前と同じなら前の値を残し、描き直しを起こさない。 */
function replacedIfChanged(
  next: readonly WorkflowArrowPath[],
): (previous: readonly WorkflowArrowPath[]) => readonly WorkflowArrowPath[] {
  return (previous) => (isDeepEqual(previous, next) ? previous : next)
}

function arrowPathsIn(
  root: HTMLDivElement,
  arrows: readonly WorkflowDiagramArrow[],
): readonly WorkflowArrowPath[] {
  const origin = root.getBoundingClientRect()
  // 重なる面は開くときに縮めた形から広げるので、その途中で測った矩形を縮める前の寸法に戻す。
  // 寸法は動きの前後で変わらず、観測し直す合図が来ないため。
  const scale = root.offsetWidth === 0 ? 1 : origin.width / root.offsetWidth
  const rects = new Map(
    [...root.querySelectorAll<HTMLElement>("[data-diagram-end]")].map((element) => {
      const rect = element.getBoundingClientRect()
      return [
        element.dataset["diagramEnd"] ?? "",
        {
          left: (rect.left - origin.left) / scale,
          top: (rect.top - origin.top) / scale,
          width: rect.width / scale,
          height: rect.height / scale,
        },
      ] as const satisfies readonly [string, WorkflowDiagramRect]
    }),
  )
  return workflowArrowPathsOf(arrows, rects, { left: 0, top: 0 })
}
