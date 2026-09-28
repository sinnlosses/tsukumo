// サイドバーの下端の帯のうち、コンテキストの札の下に5時間枠と7日間枠の使用状況を出す札。
// 取り直すのは開いたとき・ターンが終わるたび・右上の ↻ を押したとき（`usePlanUsage`）。
//
// claude.ai の契約でないとき（`not-applicable`）は、再読み込みしても変わらないので ↻ を出さない。
// 取れなかったとき（`unavailable`）は ↻ で取り直せる一言に置き換わる。
// どちらも2段の枠の行の代わりに1行の高さを保つ。
//
// 取得中に前の値があれば、2段の枠の行を薄く残したまま「取得中…」を出す（`fetching` が `true` のとき）。
//
// 取り直しのあいだは札に `aria-busy` を立てる。
// E2E の「DOM が落ち着くまで待つ」判定はこれを見て、ターンの終わりに始まった取り直しが終わるまで撮らない。

import clsx from "clsx"
import { CircleX, TriangleAlert } from "lucide-react"
import type { ReactElement } from "react"

import { useSession } from "../../../stores/session.ts"
import {
  clockTime,
  dayAwareClockTime,
  localTimeZoneId,
  nowEpochMilliseconds,
  zonedDateTime,
} from "../../../utils/clock.ts"
import { Button } from "../../ui/button/button.tsx"
import { RefreshIcon } from "../../ui/icon/icon.tsx"
import { planUsageRefetchKey, type PlanUsageState, usePlanUsage } from "./plan-usage.ts"
import styles from "./sidebar.module.css"

const ROW_LABEL = "利用枠"
const FETCHING_TEXT = "取得中…"
const TIME_PLACEHOLDER = "—"
const NOT_APPLICABLE_TEXT = "API キーで使っているため、利用枠はありません"
const UNAVAILABLE_TEXT = "利用枠を取れませんでした。↻ で取り直せます"
/** 高いときの境目（%）。見本（`QUOTA-Sidebar.dc.html`「2 高いとき」）の値。 */
const WARN_THRESHOLD_PERCENTAGE = 80

type WindowDisplay = {
  readonly utilization: number | undefined
  readonly resetsAt: number | undefined
}

export function PlanUsageRow(): ReactElement {
  const lastTurnFinishedAt = useSession((session) => session.state.lastTurnFinishedAt)
  const { state, fetching, retry } = usePlanUsage(planUsageRefetchKey(lastTurnFinishedAt))
  const windows = windowsOf(state)

  return (
    <div className={styles["plan-usage-row"]} aria-busy={fetching ? "true" : undefined}>
      <div className={styles["plan-usage-row-header"]}>
        <span className={styles["plan-usage-row-label"]}>{ROW_LABEL}</span>
        <span className={styles["plan-usage-row-spacer"]} aria-hidden="true" />
        <span
          className={clsx(
            styles["plan-usage-row-status"],
            fetching && styles["plan-usage-row-status-fetching"],
          )}
        >
          {headerText(state, fetching)}
        </span>
        {state.kind !== "not-applicable" && (
          <Button
            type="button"
            variant="ghost"
            size="action"
            pressed="none"
            disabled={fetching}
            ariaLabel="利用枠を取り直す"
            ariaHasPopup={undefined}
            title="取り直す"
            className={styles["plan-usage-row-refresh"]}
            onClick={retry}
          >
            <span className={clsx(fetching && styles["plan-usage-row-refresh-spinning"])}>
              <RefreshIcon />
            </span>
          </Button>
        )}
      </div>
      {windows === undefined ? (
        <PlanUsageNote state={state} />
      ) : (
        <div
          className={clsx(fetching && state.kind === "ready" && styles["plan-usage-row-dimmed"])}
        >
          <PlanUsageWindowRow label="5時間" window={windows.fiveHour} />
          <PlanUsageWindowRow label="7日間" window={windows.sevenDay} />
        </div>
      )}
    </div>
  )
}

/** 取れない・該当しないときの一言（2段の枠の行と同じ高さぶんの1行）。 */
function PlanUsageNote(props: { readonly state: PlanUsageState }): ReactElement {
  if (props.state.kind === "not-applicable") {
    return (
      <div className={styles["plan-usage-row-note"]}>
        <span>{NOT_APPLICABLE_TEXT}</span>
      </div>
    )
  }
  return (
    <div className={styles["plan-usage-row-note"]}>
      <span className={styles["plan-usage-row-note-icon"]} aria-hidden="true">
        <CircleX size={12} strokeWidth={2.2} />
      </span>
      <span>{UNAVAILABLE_TEXT}</span>
    </div>
  )
}

/**
 * 1つの枠の行（ラベル・棒・割合・戻る時刻）。
 * 狭いサイドバー（280px 未満）は棒を畳む（`sidebar.module.css` の `@container`）。
 */
function PlanUsageWindowRow(props: {
  readonly label: string
  readonly window: WindowDisplay
}): ReactElement {
  const warn = isWarn(props.window)
  return (
    <div className={styles["plan-usage-window-row"]}>
      <span className={styles["plan-usage-window-label"]}>{props.label}</span>
      <span className={styles["plan-usage-window-bar"]} aria-hidden="true">
        <span
          className={clsx(
            styles["plan-usage-window-bar-fill"],
            warn && styles["plan-usage-window-bar-fill-warn"],
          )}
          style={{ width: `${String(Math.min(props.window.utilization ?? 0, 100))}%` }}
        />
      </span>
      <span
        className={clsx(
          styles["plan-usage-window-percentage"],
          warn && styles["plan-usage-window-percentage-warn"],
        )}
      >
        {warn && (
          <span aria-hidden="true">
            <TriangleAlert size={11} strokeWidth={2.4} />
          </span>
        )}
        {percentageText(props.window)}
      </span>
      <span className={styles["plan-usage-window-reset"]}>{resetText(props.window)}</span>
    </div>
  )
}

/** 描く2つの枠。取れない・該当しないときは `undefined`（一言に置き換える）。 */
function windowsOf(
  state: PlanUsageState,
): { readonly fiveHour: WindowDisplay; readonly sevenDay: WindowDisplay } | undefined {
  if (state.kind === "ready") {
    return state.usage
  }
  if (state.kind === "pending") {
    const empty: WindowDisplay = { utilization: undefined, resetsAt: undefined }
    return { fiveHour: empty, sevenDay: empty }
  }
  return undefined
}

/** 見出しの右に出す時刻・状態の字。 */
function headerText(state: PlanUsageState, fetching: boolean): string {
  if (fetching) {
    return FETCHING_TEXT
  }
  if (state.kind === "ready") {
    return `${clockTime(zonedDateTime(state.takenAt, localTimeZoneId()))} 時点`
  }
  if (state.kind === "unavailable" && state.takenAt !== undefined) {
    return `${clockTime(zonedDateTime(state.takenAt, localTimeZoneId()))} に失敗`
  }
  return TIME_PLACEHOLDER
}

/** 取れていないときは警告にしない。 */
function isWarn(window: WindowDisplay): boolean {
  return window.utilization !== undefined && window.utilization >= WARN_THRESHOLD_PERCENTAGE
}

function percentageText(window: WindowDisplay): string {
  return window.utilization === undefined
    ? TIME_PLACEHOLDER
    : `${String(Math.round(window.utilization))}%`
}

function resetText(window: WindowDisplay): string {
  return window.resetsAt === undefined
    ? TIME_PLACEHOLDER
    : `${dayAwareClockTime(window.resetsAt, nowEpochMilliseconds())}に戻る`
}
