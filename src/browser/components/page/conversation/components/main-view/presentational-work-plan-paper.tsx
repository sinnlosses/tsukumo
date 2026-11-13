// 新しい器の紙に描くワークプラン。働くあいだは判定の行と計画を紙の頭に、終わったあとは同じ並びを紙の末尾の道筋に畳んで出す。

import type { ReactElement } from "react"

import { formatMeasured } from "../../../../../../shared/utils/elapsed-time.ts"
import { InlineMarkdown } from "../../../../../features/report/markdown.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { Lamp, LampRow, type LampStepState } from "../../../../ui/lamp/lamp.tsx"
import type {
  FoldedWorkPlan,
  WorkPlanRow,
  WorkPlanRowState,
  WorkPlanSlot,
} from "../../domain/work-plan-row.ts"
import { sinceText, STOPPED_CHOICES, type WorkPlanPaperModel } from "./hooks/use-work-plan-paper.ts"
import styles from "./main-view.module.css"

const VERDICT = {
  running: { mark: "◌", label: "働いている" },
  background: { mark: "◌", label: "背景で働いている" },
  asking: { mark: "●", label: "あなたの番" },
  you: { mark: "■", label: "あなたが止めた" },
  writer: { mark: "■", label: "止めた" },
} as const satisfies Record<string, { readonly mark: string; readonly label: string }>

const YOUR_TURN = "あなたの番"
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
} as const satisfies Record<WorkPlanRowState, LampStepState>

const ROW_LAMP_SIZE_PX = { now: 22, other: 18 } as const

const PLAN_LABEL = "ワークプラン"
const LIVE_NOW = "いま"
const LIVE_TOUCHED = "できた"
const SKIPPED_TAG = "飛ばした"
const RUNNING_SUFFIX = "〜"
const MIDWAY_SUFFIX = "（途中）"

/** 行を描くときの時計。`live` は働くあいだで、今の段に実況と「n秒前」を開く。`closed` は閉じたあとで、今の段を途中として描く。 */
type PlanClock = { readonly kind: "live"; readonly now: number } | { readonly kind: "closed" }

const CLOSED_CLOCK = { kind: "closed" } as const satisfies PlanClock

export function PresentationalWorkPlanPaper(props: {
  readonly model: Exclude<WorkPlanPaperModel, { readonly kind: "none" }>
}): ReactElement {
  const { model } = props
  if (model.kind === "finished") {
    return (
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
    )
  }
  if (model.kind === "stopped") {
    return <StoppedPaper model={model} />
  }
  return (
    <section className={styles["work-plan"]} aria-label={PLAN_LABEL}>
      <Stamp
        verdict={model.verdict}
        rows={model.rows}
        position={model.position}
        elapsed={model.elapsed}
      />
      {model.rows.length > 0 && (
        <ol className={styles["work-plan-list"]}>
          {model.plan.folded.kind === "folded" && (
            <FoldedItem folded={model.plan.folded} clock={CLOSED_CLOCK} />
          )}
          {model.plan.slots.map((slot) => (
            <SlotItem key={slotKeyOf(slot)} slot={slot} clock={{ kind: "live", now: model.now }} />
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
      />
      <div className={styles["work-plan-turn"]}>
        <section className={styles["work-plan-turn-part"]} data-mine="true">
          <h3 className={styles["work-plan-turn-heading"]}>{YOUR_TURN}</h3>
          <div className={styles["work-plan-choices"]}>
            {STOPPED_CHOICES.map((choice) => (
              <Button
                key={choice.key}
                variant="outline-accent"
                size="secondary"
                pressed="none"
                disabled={false}
                disclosure={{ kind: "none" }}
                className=""
                onClick={() => model.onDraft(choice.draft)}
              >
                <kbd className={styles["work-plan-choice-key"]}>{choice.key}</kbd>
                {choice.label}
              </Button>
            ))}
          </div>
        </section>
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
}): ReactElement {
  const { folded } = props
  const parts = [
    `済んだ ${String(folded.count)} 段`,
    ...(folded.duration.kind === "known" ? [formatMeasured(folded.duration)] : []),
    ...(folded.touched > 0 ? [`${String(folded.touched)}ファイル`] : []),
  ]
  return (
    <li className={styles["work-plan-phase"]} data-state="done">
      <Lamp kind="step" state="done" sizePx={ROW_LAMP_SIZE_PX.other} />
      <details className={styles["work-plan-phase-main"]}>
        <summary className={styles["work-plan-fold"]}>{parts.join(" ・ ")}</summary>
        <ol className={styles["work-plan-list"]}>
          {folded.rows.map((row) => (
            <RowItem key={row.key} row={row} span="" clock={props.clock} />
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
      : ""
  const title =
    row.state === "current" && clock.kind === "closed" ? `${row.title}${MIDWAY_SUFFIX}` : row.title
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
          <span className={styles["work-plan-phase-time"]}>{time}</span>
        </div>
        {row.summary !== "" && (
          <p className={styles["work-plan-phase-note"]}>
            <InlineMarkdown text={row.summary} />
          </p>
        )}
        {clock.kind === "live" &&
          row.state === "current" &&
          (row.live.kind === "now" || row.touched.length > 0) && (
            <LiveBlock row={row} now={clock.now} />
          )}
        {!running && row.touched.length > 0 && (
          <p className={styles["work-plan-touched"]}>{row.touched.join("　")}</p>
        )}
      </div>
    </li>
  )
}

function LiveBlock(props: { readonly row: WorkPlanRow; readonly now: number }): ReactElement {
  const { row } = props
  return (
    <div className={styles["work-plan-live"]}>
      {row.live.kind === "now" && (
        <div className={styles["work-plan-act"]}>
          <span className={styles["work-plan-act-kind"]}>{LIVE_NOW}</span>
          <span>{row.live.text}</span>
          <span className={styles["work-plan-act-when"]}>{sinceText(row.live, props.now)}</span>
        </div>
      )}
      {row.touched.length > 0 && (
        <div className={styles["work-plan-act"]} data-kind="touched">
          <span className={styles["work-plan-act-kind"]}>{LIVE_TOUCHED}</span>
          <span>{row.touched.join("　")}</span>
          <span />
        </div>
      )}
    </div>
  )
}

function slotKeyOf(slot: WorkPlanSlot): string {
  return slot.kind === "phase" ? slot.row.key : slot.key
}
