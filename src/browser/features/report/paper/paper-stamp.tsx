// 新しい器の紙の頭の判定の行。判定の札・段の狐火・所要・変えた量・確かさの件数を1行に並べる。
// 札は印と語を対にし、差し色は「あなたの番」の札と今の段の印だけに使う。

import type { ReactElement } from "react"

import type {
  PhaseListEntryView,
  PhaseTimesView,
} from "../../../../shared/report/report-phase-time.ts"
import type { ReportJudgment } from "../../../../shared/report/report-progress-field.ts"
import type { MainViewSurfaceHead } from "../../../../shared/session/main-view-shape.ts"
import { type LampStepState, LampRow } from "../../../components/ui/lamp/lamp.tsx"
import type { CertaintyLedger } from "../domain/certainty-ledger.ts"
import type { PaperForm } from "../domain/paper-form.ts"
import styles from "./paper.module.css"

type StampVerdict = ReportJudgment | "answered"

const STAMP = {
  done: { mark: "✓", label: "済んだ" },
  partial: { mark: "◐", label: "一部済んだ" },
  yours: { mark: "●", label: "あなたの番" },
  stopped: { mark: "■", label: "止めた" },
  failed: { mark: "✕", label: "失敗で止まった" },
  answered: { mark: "✓", label: "答えた" },
} as const satisfies Record<StampVerdict, { readonly mark: string; readonly label: string }>

/** 段の一覧で、時間の代わりに出る字。この字の段は狐火を済んだ印にしない。 */
const ABSENT_PHASE_STATE = {
  未着手: "todo",
  飛ばした: "skipped",
} as const satisfies Readonly<Record<string, LampStepState>>

export function PaperStamp(props: {
  readonly form: PaperForm
  readonly head: MainViewSurfaceHead
  readonly counts: CertaintyLedger["counts"]
}): ReactElement {
  const { head } = props
  const verdict: StampVerdict = props.form === "answer" ? "answered" : head.progress.verdict
  const stamp = STAMP[verdict]
  const { phaseTimes, changedFiles } = head.finalStatus
  return (
    <p className={styles["paper-stamp"]}>
      <span className={styles["paper-verdict"]} data-verdict={verdict}>
        <span aria-hidden="true">{stamp.mark}</span>
        {stamp.label}
      </span>
      {phaseTimes.kind === "times" && <PhaseLamps view={phaseTimes} />}
      {changedFiles.kind === "files" ? (
        <span>
          <b className={styles["paper-added"]}>+{changedFiles.added}</b>{" "}
          <b className={styles["paper-removed"]}>−{changedFiles.removed}</b>
          {` ・ ${String(changedFiles.count)}ファイル`}
        </span>
      ) : (
        <span>変更なし</span>
      )}
      <CheckCounts counts={props.counts} />
    </p>
  )
}

function PhaseLamps(props: {
  readonly view: Extract<PhaseTimesView, { readonly kind: "times" }>
}): ReactElement {
  const lamps = props.view.rows.map((entry, index) => ({
    key: String(index),
    state: lampStateOf(entry),
  }))
  const label = `${String(lamps.length)}段 ・ ${props.view.totalText}`
  return (
    <>
      <LampRow lamps={lamps} label={label} />
      <span className={styles["paper-time"]}>{label}</span>
    </>
  )
}

function lampStateOf(entry: PhaseListEntryView): LampStepState {
  const row = entry.kind === "row" ? entry.row : entry.head
  return Object.entries(ABSENT_PHASE_STATE).find(([word]) => word === row.valueText)?.[1] ?? "done"
}

/** 確かさの台帳の3群の件数。落ちた（✕）・確かめていない（？）・確かめた（✓）の順に、0件の群は出さない。 */
function CheckCounts(props: { readonly counts: CertaintyLedger["counts"] }): ReactElement {
  const { counts } = props
  const groups = [
    { tone: "ng", mark: "✕", word: "落ちた", count: counts.failed },
    { tone: "unknown", mark: "？", word: "確かめていない", count: counts.unknown },
    { tone: "ok", mark: "✓", word: "確かめた", count: counts.passed },
  ].filter((group) => group.count > 0)
  if (groups.length === 0) {
    return <></>
  }
  return (
    <span
      className={styles["paper-counts"]}
      aria-label={groups.map((group) => `${group.word} ${String(group.count)}`).join("・")}
    >
      {groups.map((group) => (
        <b key={group.tone} className={styles["paper-count"]} data-tone={group.tone}>
          {group.mark}
          {group.count}
        </b>
      ))}
    </span>
  )
}
