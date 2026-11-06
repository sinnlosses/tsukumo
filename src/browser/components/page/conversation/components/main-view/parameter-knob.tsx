// 触れるレポートのつまみ（`ParameterSlider`・`ParameterCheckBox`）と、振った値で式を結んだ内容部品を評価し直す口。
// 振った値は面のデータモデルの `/view/<つまみのID>/value` に置き、イベントにも記録にも載せない。
// 面は本文ごとに作り直さないが、部品を作り直すとデータモデルごと空に戻り、つまみは初期値から描き直す。

import { type ReactElement, useId, useSyncExternalStore } from "react"

import type { A2uiWrittenComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { ExprParams } from "../../../../../../shared/report/report-expression-evaluate.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import {
  type ReevaluatedLeaf,
  reevaluatedReportLeaves,
  type WrittenReportView,
} from "../../../../../../shared/report/report-static-component-list.ts"
import { partViewPath } from "../../../../../../shared/report/table-view.ts"
import { type DataModel, useDataPath } from "./a2ui-interactive-view.tsx"
import { useReportRevealing } from "./body-region.tsx"
import { FailedChartLeaf } from "./chart-leaf.tsx"
import styles from "./main-view.module.css"

type Knob = Extract<
  A2uiWrittenComponent,
  { readonly component: "ParameterSlider" | "ParameterCheckBox" }
>

type ReevaluatedLeaves = Readonly<Record<string, ReevaluatedLeaf>>

/**
 * つまみの値を購読し、式を持つ `Stats`・`Paragraph`・`Chart`・`ChartGrid` を評価し直して部品の ID で返す。
 * 面が作れず `dataModel` が無いとき・つまみも式も無い一覧では空。
 */
export function useReevaluatedLeaves(
  dataModel: DataModel | undefined,
  written: WrittenReportView,
): ReevaluatedLeaves {
  const components = written.kind === "none" ? [] : written.components
  const knobs = components.filter(isKnob)
  const snapshot = useSyncExternalStore(
    (onChange) => {
      const subscriptions = knobs.map((knob) =>
        dataModel?.subscribe(partViewPath(knob.id, "value"), onChange),
      )
      return () => {
        for (const subscription of subscriptions) subscription?.unsubscribe()
      }
    },
    () => JSON.stringify(knobs.map((knob) => dataModel?.get(partViewPath(knob.id, "value")))),
  )
  if (dataModel === undefined || written.kind === "none") {
    return NO_LEAVES
  }
  return reevaluatedReportLeaves(components, paramsOf(knobs, snapshot))
}

/**
 * 面の部品 1 つを、つまみか図の代わりに「—」を描く `Chart`・`ChartGrid` として描く。
 * どちらでもなければ undefined（ほかの部品の描き方に任せる）。
 */
export function liveLeafElement(
  report: {
    readonly dataModel: DataModel
    readonly view: {
      readonly written: WrittenReportView
      readonly leafValues: Readonly<Record<string, LeafValue>>
    }
    readonly leaves: ReevaluatedLeaves
  },
  id: string,
): ReactElement | undefined {
  const { written, leafValues } = report.view
  const knob =
    written.kind === "none"
      ? undefined
      : written.components.find(
          (component): component is Knob => component.id === id && isKnob(component),
        )
  if (knob !== undefined) {
    return (
      <ParameterKnob dataModel={report.dataModel} knob={knob} locked={written.kind === "locked"} />
    )
  }
  const leaf = report.leaves[id]
  const value = leafValues[id]
  return leaf?.kind === "chart-failed" && value !== undefined ? (
    <FailedChartLeaf part={leaf.component} value={value} />
  ) : undefined
}

const NO_LEAVES: ReevaluatedLeaves = {}

function isKnob(component: A2uiWrittenComponent): component is Knob {
  return component.component === "ParameterSlider" || component.component === "ParameterCheckBox"
}

/** 購読した値の並び（JSON）を、つまみの `name` → 値に読む。型の合わない値は落とし、初期値で読ませる。 */
function paramsOf(knobs: readonly Knob[], snapshot: string): ExprParams {
  const values: unknown = JSON.parse(snapshot)
  return Object.fromEntries(
    knobs.flatMap((knob, index) => {
      const value: unknown = Array.isArray(values) ? values[index] : undefined
      return typeof value === typeof knob.initial &&
        (typeof value === "number" || typeof value === "boolean")
        ? [[knob.name, value]]
        : []
    }),
  )
}

/** つまみ 1 つ。演出の最中と草稿（`locked`）では操作できない。 */
function ParameterKnob(props: {
  readonly dataModel: DataModel
  readonly knob: Knob
  readonly locked: boolean
}): ReactElement {
  const { dataModel, knob } = props
  const path = partViewPath(knob.id, "value")
  const stored = useDataPath<unknown>(dataModel, path)
  const revealing = useReportRevealing()
  const inputId = useId()
  const disabled = props.locked || revealing
  if (knob.component === "ParameterCheckBox") {
    return (
      <div className={styles["parameter-knob"]} data-parameter-knob={knob.id}>
        <label className={styles["parameter-knob-check"]}>
          <input
            type="checkbox"
            checked={typeof stored === "boolean" ? stored : knob.initial}
            disabled={disabled}
            onChange={(event) => {
              dataModel.set(path, event.currentTarget.checked)
            }}
          />
          {knob.label}
        </label>
      </div>
    )
  }
  const value = typeof stored === "number" ? stored : knob.initial
  return (
    <div className={styles["parameter-knob"]} data-parameter-knob={knob.id}>
      <label htmlFor={inputId}>{knob.label}</label>
      <output htmlFor={inputId} className={styles["parameter-knob-value"]}>
        {String(value)}
      </output>
      <input
        id={inputId}
        type="range"
        className={styles["parameter-knob-range"]}
        min={knob.min}
        max={knob.max}
        step={knob.step}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          dataModel.set(path, event.currentTarget.valueAsNumber)
        }}
      />
    </div>
  )
}
