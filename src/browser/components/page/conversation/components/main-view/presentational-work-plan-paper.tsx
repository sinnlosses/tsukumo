// 新しい器の紙に描くワークプラン。働くあいだは判定の行と計画を紙の頭に、終わったあとは同じ並びを紙の末尾の道筋に畳んで出す。

import { Fragment, type ReactElement } from "react"

import { formatMeasured } from "../../../../../../shared/utils/elapsed-time.ts"
import { InlineMarkdown } from "../../../../../features/report/markdown.tsx"
import { Lamp, LampRow, type LampStepState } from "../../../../ui/lamp/lamp.tsx"
import {
  type FoldedWorkPlan,
  rowsOfSlot,
  type WorkPlanRow,
  type WorkPlanRowState,
  type WorkPlanSlot,
} from "../../domain/work-plan-row.ts"
import type { WorkPlanPaperModel } from "./hooks/use-work-plan-paper.ts"
import type { WorkQuietLine } from "./hooks/use-work-quiet.ts"
import styles from "./main-view.module.css"
import { AwayBriefBlock, ReadMark } from "./presentational-away-brief.tsx"
import { PresentationalFailedPaper } from "./presentational-failed-paper.tsx"
import { ASK_TAG, WorkPlanAskBlock } from "./presentational-work-plan-ask.tsx"
import { LapList, LiveBlock, QuietAct } from "./presentational-work-plan-live.tsx"
import { PLAN_LABEL, YourTurnPart } from "./your-turn-part.tsx"

const VERDICT = {
  running: { mark: "◌", label: "働いている" },
  background: { mark: "◌", label: "背景で働いている" },
  asking: { mark: "●", label: "あなたの番" },
  you: { mark: "■", label: "あなたが止めた" },
  writer: { mark: "■", label: "止めた" },
  failed: { mark: "✕", label: "失敗で止まった" },
} as const satisfies Record<string, { readonly mark: string; readonly label: string }>

const UNFINISHED = "中途半端なもの"
const UNFINISHED_NONE = "今の段で書きかけのファイルは無い。"
const DONE_SO_FAR = "ここまでにできたこと"

const ROUTE_TITLE = {
  finished: "この結論に至った道筋",
  stopped: "ここまでの道筋",
} as const

const LAMP_STATE = {
  done: "done",
  current: "now",
  upcoming: "todo",
  skipped: "skipped",
  failed: "fail",
} as const satisfies Record<WorkPlanRowState, LampStepState>

const ROW_LAMP_SIZE_PX = { now: 22, other: 18 } as const

const SKIPPED_TAG = "飛ばした"
const FAILED_TAG = "ここで止まった"
const RUNNING_SUFFIX = "〜"
const MIDWAY_SUFFIX = "（途中）"

/**
 * 行を描くときの時計。`live` は働くあいだで、今の段に実況と「n秒前」を開き、
 * `quietRowKey` の行（今の段のうち読み順で最初の行）に止まって見えるときの行を置く。`closed` は閉じたあとで、今の段を途中として描く。
 */
type PlanClock =
  | {
      readonly kind: "live"
      readonly now: number
      readonly quietLine: WorkQuietLine
      readonly quietRowKey: string
    }
  | { readonly kind: "closed" }

const CLOSED_CLOCK = { kind: "closed" } as const satisfies PlanClock

export function PresentationalWorkPlanPaper(props: {
  readonly model: Exclude<WorkPlanPaperModel, { readonly kind: "none" }>
}): ReactElement {
  const { model } = props
  if (model.kind === "finished") {
    return (
      <>
        {model.away.kind === "brief" && <AwayBriefBlock brief={model.away} />}
        <details className={styles["work-plan-route"]} data-ending={model.ending}>
          <summary className={styles["work-plan-route-summary"]}>
            {`${ROUTE_TITLE[model.ending]} ― ${model.summary}`}
          </summary>
          <ol className={styles["work-plan-list"]} aria-label={PLAN_LABEL}>
            {model.slots.map((slot) => (
              <SlotItem key={slotKeyOf(slot)} slot={slot} clock={CLOSED_CLOCK} />
            ))}
          </ol>
        </details>
      </>
    )
  }
  if (model.kind === "stopped") {
    return <StoppedPaper model={model} />
  }
  if (model.kind === "failed") {
    return (
      <PresentationalFailedPaper
        model={model}
        stamp={
          <Stamp
            verdict="failed"
            rows={model.rows}
            position={model.position}
            elapsed={model.elapsed}
            estimate=""
          />
        }
        away={model.away.kind === "brief" && <AwayBriefBlock brief={model.away} />}
        plan={
          <ol className={styles["work-plan-list"]}>
            {model.slots.map((slot) => (
              <SlotItem key={slotKeyOf(slot)} slot={slot} clock={CLOSED_CLOCK} />
            ))}
          </ol>
        }
      />
    )
  }
  const quietRowKey = model.rows.find((row) => row.state === "current")?.key ?? ""
  const clock: PlanClock = { kind: "live", now: model.now, quietLine: model.quietLine, quietRowKey }
  const { away } = model
  const markKey =
    away.kind === "brief" && away.markBeforeRowKey.kind === "row" ? away.markBeforeRowKey.key : ""
  return (
    <section className={styles["work-plan"]} aria-label={PLAN_LABEL}>
      <Stamp
        verdict={model.verdict}
        rows={model.rows}
        position={model.position}
        elapsed={model.elapsed}
        estimate={model.estimate.kind === "shown" ? model.estimate.text : ""}
      />
      {away.kind === "brief" && <AwayBriefBlock brief={away} />}
      {quietRowKey === "" && model.quietLine.quiet.kind !== "none" && (
        <div className={styles["work-plan-live"]}>
          <QuietAct line={model.quietLine} />
        </div>
      )}
      {model.rows.length > 0 && (
        <ol className={styles["work-plan-list"]}>
          {model.plan.folded.kind === "folded" && (
            <FoldedItem folded={model.plan.folded} clock={CLOSED_CLOCK} markKey={markKey} />
          )}
          {model.plan.slots.map((slot) => (
            <Fragment key={slotKeyOf(slot)}>
              {rowsOfSlot(slot).some((row) => row.key === markKey) && <ReadMark />}
              <SlotItem slot={slot} clock={clock} />
            </Fragment>
          ))}
        </ol>
      )}
    </section>
  )
}

/** 段の狐火の並び。紙の判定の行と入力欄の札が同じ並びを出す。 */
export function WorkPlanLamps(props: {
  readonly rows: readonly WorkPlanRow[]
  readonly label: string
}): ReactElement {
  return (
    <LampRow
      lamps={props.rows.map((row) => ({ key: row.key, state: LAMP_STATE[row.state] }))}
      label={props.label}
    />
  )
}

function Stamp(props: {
  readonly verdict: keyof typeof VERDICT
  readonly rows: readonly WorkPlanRow[]
  readonly position: string
  readonly elapsed: string
  /** 見込み「あと約 4分（…から）」。出さないなら空。 */
  readonly estimate: string
}): ReactElement {
  const verdict = VERDICT[props.verdict]
  return (
    <p className={styles["work-plan-stamp"]}>
      <span className={styles["work-plan-verdict"]} data-verdict={props.verdict}>
        <span aria-hidden="true">{verdict.mark}</span>
        {verdict.label}
      </span>
      {props.rows.length > 0 && <WorkPlanLamps rows={props.rows} label={props.position} />}
      {props.position !== "" && <span>{props.position}</span>}
      <span className={styles["work-plan-elapsed"]}>{props.elapsed}</span>
      {props.estimate !== "" && <span>{props.estimate}</span>}
    </p>
  )
}

function StoppedPaper(props: {
  readonly model: Extract<WorkPlanPaperModel, { readonly kind: "stopped" }>
}): ReactElement {
  const { model } = props
  return (
    <section className={styles["work-plan"]} aria-label={PLAN_LABEL}>
      <Stamp
        verdict={model.stopper}
        rows={model.rows}
        position={model.position}
        elapsed={model.elapsed}
        estimate=""
      />
      {model.away.kind === "brief" && <AwayBriefBlock brief={model.away} />}
      <div className={styles["work-plan-turn"]}>
        <YourTurnPart onDraft={model.onDraft} extra={false} />
        <section className={styles["work-plan-turn-part"]}>
          <h3 className={styles["work-plan-turn-heading"]}>{UNFINISHED}</h3>
          <p className={styles["work-plan-phase-note"]}>
            {model.unfinished.length === 0 ? UNFINISHED_NONE : model.unfinished.join("　")}
          </p>
        </section>
      </div>
      <h3 className={styles["work-plan-turn-heading"]}>{DONE_SO_FAR}</h3>
      <ol className={styles["work-plan-list"]}>
        {model.slots.map((slot) => (
          <SlotItem key={slotKeyOf(slot)} slot={slot} clock={CLOSED_CLOCK} />
        ))}
      </ol>
    </section>
  )
}

function FoldedItem(props: {
  readonly folded: Extract<FoldedWorkPlan["folded"], { readonly kind: "folded" }>
  readonly clock: PlanClock
  /** 印を前に引く行の `key`。畳んだ行の中にあれば畳みを開いて出す。引かないなら空。 */
  readonly markKey: string
}): ReactElement {
  const { folded, markKey } = props
  const marked = folded.rows.some((row) => row.key === markKey)
  const parts = [
    `済んだ ${String(folded.count)} 段`,
    ...(folded.duration.kind === "known" ? [formatMeasured(folded.duration)] : []),
    ...(folded.touched > 0 ? [`${String(folded.touched)}ファイル`] : []),
  ]
  return (
    <li className={styles["work-plan-phase"]} data-state="done">
      <Lamp kind="step" state="done" sizePx={ROW_LAMP_SIZE_PX.other} />
      <details className={styles["work-plan-phase-main"]} open={marked}>
        <summary className={styles["work-plan-fold"]}>{parts.join(" ・ ")}</summary>
        <ol className={styles["work-plan-list"]}>
          {folded.rows.map((row) => (
            <Fragment key={row.key}>
              {row.key === markKey && <ReadMark />}
              <RowItem row={row} span="" clock={props.clock} />
            </Fragment>
          ))}
        </ol>
      </details>
    </li>
  )
}

function SlotItem(props: { readonly slot: WorkPlanSlot; readonly clock: PlanClock }): ReactElement {
  const { slot } = props
  const span = slot.spanHead.kind === "head" ? slot.spanHead.name : ""
  if (slot.kind === "phase") {
    return <RowItem row={slot.row} span={span} clock={props.clock} />
  }
  return (
    <li className={styles["work-plan-parallel"]}>
      <span className={styles["work-plan-parallel-label"]}>
        {span === "" ? slot.label : `${span} ${slot.label}`}
      </span>
      <ol className={styles["work-plan-list"]}>
        {slot.rows.map((row) => (
          <RowItem key={row.key} row={row} span="" clock={props.clock} />
        ))}
      </ol>
    </li>
  )
}

function RowItem(props: {
  readonly row: WorkPlanRow
  /** 群の先頭の行に付ける群の名。付けないなら空。 */
  readonly span: string
  readonly clock: PlanClock
}): ReactElement {
  const { row, clock } = props
  const running = row.state === "current" && clock.kind === "live"
  const time =
    row.duration.kind === "known"
      ? `${formatMeasured(row.duration)}${running ? RUNNING_SUFFIX : ""}`
      : row.usual.kind === "shown" && clock.kind === "live"
        ? row.usual.text
        : ""
  const title =
    row.state === "current" && clock.kind === "closed" ? `${row.title}${MIDWAY_SUFFIX}` : row.title
  // 周を持つ段では実況を「直し」の周の行が出すので、「いま」の行には重ねない。
  const liveNow = row.live.kind === "now" && row.laps.length === 0
  const quietLine =
    clock.kind === "live" && clock.quietRowKey === row.key && clock.quietLine.quiet.kind !== "none"
      ? [clock.quietLine]
      : []
  return (
    <li className={styles["work-plan-phase"]} data-state={row.state}>
      <Lamp
        kind="step"
        state={LAMP_STATE[row.state]}
        sizePx={row.state === "current" ? ROW_LAMP_SIZE_PX.now : ROW_LAMP_SIZE_PX.other}
      />
      <div className={styles["work-plan-phase-main"]}>
        <div className={styles["work-plan-phase-head"]}>
          {props.span !== "" && <span className={styles["work-plan-tag"]}>{props.span}</span>}
          <span className={styles["work-plan-phase-title"]}>{title}</span>
          {row.lap > 1 && (
            <span className={styles["work-plan-tag"]} data-tone="warn">
              {`${String(row.lap)}周目`}
            </span>
          )}
          {row.state === "skipped" && (
            <span className={styles["work-plan-tag"]}>{SKIPPED_TAG}</span>
          )}
          {row.ask.kind === "asked" && (
            <span className={styles["work-plan-tag"]} data-tone="ask">
              {ASK_TAG}
            </span>
          )}
          {row.state === "failed" && (
            <span className={styles["work-plan-tag"]} data-tone="ng">
              {FAILED_TAG}
            </span>
          )}
          <span className={styles["work-plan-phase-time"]}>{time}</span>
        </div>
        {row.summary !== "" && (
          <p className={styles["work-plan-phase-note"]}>
            <InlineMarkdown text={row.summary} />
          </p>
        )}
        {row.laps.length > 0 && <LapList row={row} running={running} />}
        {row.ask.kind === "asked" && <WorkPlanAskBlock ask={row.ask} />}
        {clock.kind === "live" &&
          row.state === "current" &&
          (liveNow ||
            row.touched.length > 0 ||
            row.delegates.length > 0 ||
            quietLine.length > 0) && (
            <LiveBlock row={row} liveNow={liveNow} now={clock.now} quietLines={quietLine} />
          )}
        {!running && row.touched.length > 0 && (
          <p className={styles["work-plan-touched"]}>{row.touched.join("　")}</p>
        )}
      </div>
    </li>
  )
}

function slotKeyOf(slot: WorkPlanSlot): string {
  return slot.kind === "phase" ? slot.row.key : slot.key
}
