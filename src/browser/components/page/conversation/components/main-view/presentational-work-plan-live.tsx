// 紙の計画の行に開く、いまの実況・任せた役・周・止まって見えるときの行の部品。

import type { ReactElement } from "react"

import { formatMeasured } from "../../../../../../shared/utils/elapsed-time.ts"
import { Button } from "../../../../ui/button/button.tsx"
import {
  foldDelegates,
  foldLaps,
  type WorkPlanDelegate,
  type WorkPlanLap,
  type WorkPlanRow,
} from "../../domain/work-plan-row.ts"
import { sinceText } from "./hooks/use-work-plan-paper.ts"
import type { WorkQuietLine } from "./hooks/use-work-quiet.ts"
import styles from "./main-view.module.css"

const LIVE_NOW = "いま"
const LIVE_TOUCHED = "できた"
const LIVE_DELEGATE = "任せた"
const DELEGATES_DONE = "済んだ"
const DELEGATE_SEPARATOR = " ― "
const RUNNING_SUFFIX = "〜"

const LAP_MARK = { rejected: "✕", fixed: "✓" } as const

const QUIET_OUTPUT = "出力を見る"
const QUIET_STOP = "止める"
const QUIET_RESTORE = "依頼を入力欄に戻す"

/** 段の中の周の行。差し戻しと直しを交互に並べ、4周目からは前の周を `<details>` に畳む。 */
export function LapList(props: {
  readonly row: WorkPlanRow
  readonly running: boolean
}): ReactElement {
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

export function LiveBlock(props: {
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

/**
 * 止まって見えるときの行。動かないときは「出力を見る」（走っている手順の道具と引数）と「止める」、
 * 上限のときは「依頼を入力欄に戻す」を添える。
 */
export function QuietAct(props: { readonly line: WorkQuietLine }): ReactElement {
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
