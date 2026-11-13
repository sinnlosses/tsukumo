// 新しい器の紙に描くワークプラン。働くあいだは判定の行と計画を紙の頭に、終わったあとは同じ並びを紙の末尾の道筋に畳んで出す。

import type { ReactElement } from "react"

import { formatMeasured } from "../../../../../../shared/utils/elapsed-time.ts"
import { InlineMarkdown } from "../../../../../features/report/markdown.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { Lamp, LampRow, type LampStepState } from "../../../../ui/lamp/lamp.tsx"
import {
  foldDelegates,
  type FoldedWorkPlan,
  foldLaps,
  type WorkPlanDelegate,
  type WorkPlanLap,
  type WorkPlanRow,
  type WorkPlanRowState,
  type WorkPlanSlot,
} from "../../domain/work-plan-row.ts"
import { sinceText, STOPPED_CHOICES, type WorkPlanPaperModel } from "./hooks/use-work-plan-paper.ts"
import type { WorkQuietLine } from "./hooks/use-work-quiet.ts"
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
const LIVE_DELEGATE = "任せた"
const DELEGATES_DONE = "済んだ"
const DELEGATE_SEPARATOR = " ― "
const LAP_MARK = { rejected: "✕", fixed: "✓" } as const
const SKIPPED_TAG = "飛ばした"
const RUNNING_SUFFIX = "〜"
const MIDWAY_SUFFIX = "（途中）"

const QUIET_OUTPUT = "出力を見る"
const QUIET_STOP = "止める"
const QUIET_RESTORE = "依頼を入力欄に戻す"

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
  const quietRowKey = model.rows.find((row) => row.state === "current")?.key ?? ""
  const clock: PlanClock = { kind: "live", now: model.now, quietLine: model.quietLine, quietRowKey }
  return (
    <section className={styles["work-plan"]} aria-label={PLAN_LABEL}>
      <Stamp
        verdict={model.verdict}
        rows={model.rows}
        position={model.position}
        elapsed={model.elapsed}
        estimate={model.estimate.kind === "shown" ? model.estimate.text : ""}
      />
      {quietRowKey === "" && model.quietLine.quiet.kind !== "none" && (
        <div className={styles["work-plan-live"]}>
          <QuietAct line={model.quietLine} />
        </div>
      )}
      {model.rows.length > 0 && (
        <ol className={styles["work-plan-list"]}>
          {model.plan.folded.kind === "folded" && (
            <FoldedItem folded={model.plan.folded} clock={CLOSED_CLOCK} />
          )}
          {model.plan.slots.map((slot) => (
            <SlotItem key={slotKeyOf(slot)} slot={slot} clock={clock} />
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
          <span className={styles["work-plan-phase-time"]}>{time}</span>
        </div>
        {row.summary !== "" && (
          <p className={styles["work-plan-phase-note"]}>
            <InlineMarkdown text={row.summary} />
          </p>
        )}
        {row.laps.length > 0 && <LapList row={row} running={running} />}
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

/** 段の中の周の行。差し戻しと直しを交互に並べ、4周目からは前の周を `<details>` に畳む。 */
function LapList(props: { readonly row: WorkPlanRow; readonly running: boolean }): ReactElement {
  const { row, running } = props
  const { folded, laps } = foldLaps(row.laps)
  const liveText = row.live.kind === "now" ? row.live.text : ""
  return (
    <div className={styles["work-plan-laps"]}>
      {folded.kind === "folded" && (
        <details className={styles["work-plan-lap-fold"]}>
          <summary className={styles["work-plan-fold"]}>{foldedLapsText(folded.count)}</summary>
          {folded.laps.map((lap) => (
            <LapItem key={lap.key} lap={lap} liveText="" running={false} />
          ))}
        </details>
      )}
      {laps.map((lap) => (
        <LapItem key={lap.key} lap={lap} liveText={liveText} running={running} />
      ))}
    </div>
  )
}

function LapItem(props: {
  readonly lap: WorkPlanLap
  readonly liveText: string
  readonly running: boolean
}): ReactElement {
  const { lap } = props
  const now = lap.result === "now"
  const time =
    lap.duration.kind === "known"
      ? `${formatMeasured(lap.duration)}${now && props.running ? RUNNING_SUFFIX : ""}`
      : ""
  return (
    <div className={styles["work-plan-lap"]} data-result={lap.result}>
      <span className={styles["work-plan-lap-label"]}>{lap.label}</span>
      <span>
        {lap.result !== "now" && (
          <>
            <span className={styles["work-plan-lap-mark"]} data-result={lap.result}>
              {LAP_MARK[lap.result]}
            </span>{" "}
          </>
        )}
        {now ? <b>{props.liveText}</b> : lap.text}
      </span>
      <span className={styles["work-plan-act-when"]}>{time}</span>
    </div>
  )
}

function LiveBlock(props: {
  readonly row: WorkPlanRow
  /** 「いま」の行を出すか。 */
  readonly liveNow: boolean
  readonly now: number
  /** 止まって見えるときの行。置かない段では空。 */
  readonly quietLines: readonly WorkQuietLine[]
}): ReactElement {
  const { row } = props
  const { folded, delegates } = foldDelegates(row.delegates)
  return (
    <div className={styles["work-plan-live"]}>
      {props.quietLines.map((line) => (
        <QuietAct key={line.quiet.kind} line={line} />
      ))}
      {props.liveNow && row.live.kind === "now" && (
        <div className={styles["work-plan-act"]}>
          <span className={styles["work-plan-act-kind"]}>{LIVE_NOW}</span>
          <span>{row.live.text}</span>
          <span className={styles["work-plan-act-when"]}>
            {sinceText(row.live.startedAt, props.now)}
          </span>
        </div>
      )}
      {delegates.map((delegate) => (
        <DelegateItem key={delegate.key} delegate={delegate} now={props.now} />
      ))}
      {folded.kind === "folded" && (
        <details className={styles["work-plan-delegate-fold"]}>
          <summary className={styles["work-plan-fold"]}>
            {`${DELEGATES_DONE} ${String(folded.delegates.length)} つ`}
          </summary>
          {folded.delegates.map((delegate) => (
            <DelegateItem key={delegate.key} delegate={delegate} now={props.now} />
          ))}
        </details>
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

/** 「任せた」の行。役の名前と進みの最新の1行。済んだ役は ✓ を付ける（文言は役の1行のまま）。 */
function DelegateItem(props: {
  readonly delegate: WorkPlanDelegate
  readonly now: number
}): ReactElement {
  const { delegate } = props
  return (
    <div className={styles["work-plan-act"]} data-kind="delegate" data-state={delegate.state}>
      <span className={styles["work-plan-act-kind"]}>{LIVE_DELEGATE}</span>
      <span>
        {delegate.name}
        {(delegate.state === "done" || delegate.text !== "") && DELEGATE_SEPARATOR}
        {delegate.state === "done" && (
          <>
            <span className={styles["work-plan-lap-mark"]} data-result="fixed">
              {LAP_MARK.fixed}
            </span>{" "}
          </>
        )}
        {delegate.text}
      </span>
      <span className={styles["work-plan-act-when"]}>{sinceText(delegate.since, props.now)}</span>
    </div>
  )
}

/**
 * 止まって見えるときの行。動かないときは「出力を見る」（走っている手順の道具と引数）と「止める」、
 * 上限のときは「依頼を入力欄に戻す」を添える。
 */
function QuietAct(props: { readonly line: WorkQuietLine }): ReactElement {
  const { quiet, runningLine } = props.line
  if (quiet.kind === "none") {
    return <></>
  }
  return (
    <div className={styles["work-plan-act"]} data-kind="quiet" data-quiet={quiet.kind}>
      <span className={styles["work-plan-act-kind"]}>{quiet.label}</span>
      <span className={styles["work-plan-quiet-body"]}>
        <span className={styles["work-plan-quiet-text"]}>{quiet.text}</span>
        {quiet.kind === "stalled" && (
          <span className={styles["work-plan-quiet-actions"]}>
            {runningLine !== "" && (
              <details className={styles["work-plan-quiet-output"]}>
                <summary>{QUIET_OUTPUT}</summary>
                <code>{runningLine}</code>
              </details>
            )}
            <QuietButton label={QUIET_STOP} onClick={props.line.onStop} />
          </span>
        )}
        {quiet.kind === "limited" && (
          <span className={styles["work-plan-quiet-actions"]}>
            <QuietButton label={QUIET_RESTORE} onClick={props.line.onRestoreRequest} />
          </span>
        )}
      </span>
      <span />
    </div>
  )
}

function QuietButton(props: {
  readonly label: string
  readonly onClick: () => void
}): ReactElement {
  return (
    <Button
      variant="outline-accent"
      size="secondary"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "none" }}
      className=""
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  )
}

function foldedLapsText(count: number): string {
  const range = count === 1 ? "1周目" : `1〜${String(count)}周目`
  return `${range} ${LAP_MARK.rejected} ${String(count)} 回`
}

function slotKeyOf(slot: WorkPlanSlot): string {
  return slot.kind === "phase" ? slot.row.key : slot.key
}
