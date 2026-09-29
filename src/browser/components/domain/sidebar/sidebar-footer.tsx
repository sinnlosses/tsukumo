// サイドバーの下端の帯。1行に、左からモデル・effort・許可モードの操作子（`RunSettingGroup`）、コンテキストの目盛り、利用枠の2つの円を並べる。
// 目盛りと円はどちらも押せる口で、押すと帯の上に詳しい面（いまのコンテキストの札と利用枠の札）が開く。
//
// コンテキストの使用量と利用枠は、ここで1回だけ取って目盛りと詳しい面の両方へ配る（取り直しを2重にしない）。
// コンテキストはトークン消費の画面の札と同じ `refetchKey` を渡すので、`useQuery` の cache 1本に相乗りする。
//
// 取り直しのあいだは目盛りの口に `aria-busy` を立てる（面を閉じていても立つ）。
// E2E の「DOM が落ち着くまで待つ」判定はこれを見て、ターンの終わりに始まった取り直しが終わるまで撮らない。

import clsx from "clsx"
import { useId, useRef, useState, type ReactElement } from "react"

import {
  contextUsageRefetchKey,
  type UseContextUsageResult,
  useContextUsage,
} from "../../../domain/context-usage.ts"
import { useDismissSignal } from "../../../hooks/use-dismiss-signal.ts"
import { useSession } from "../../../stores/session.ts"
import { formatCount } from "../../../utils/format-count.ts"
import { ContextUsageRow, isContextUsageWarn } from "./context-usage-row.tsx"
import { PlanUsageRow, isPlanWindowWarn, windowsOf, type WindowDisplay } from "./plan-usage-row.tsx"
import { planUsageRefetchKey, type UsePlanUsageResult, usePlanUsage } from "./plan-usage.ts"
import { RunSettingGroup } from "./run-setting-group.tsx"
import styles from "./sidebar.module.css"

const DETAIL_LABEL = "使用量の詳しい面"
const PLACEHOLDER = "—"

export function SidebarFooter(): ReactElement {
  const lastTurnFinishedAt = useSession((session) => session.state.lastTurnFinishedAt)
  const contextUsage = useContextUsage(contextUsageRefetchKey(lastTurnFinishedAt))
  const planUsage = usePlanUsage(planUsageRefetchKey(lastTurnFinishedAt))
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const detailId = useId()

  useDismissSignal({
    open,
    rootRef: ref,
    onDismiss: () => {
      setOpen(false)
    },
  })

  function onToggle(): void {
    setOpen((wasOpen) => !wasOpen)
  }

  return (
    <div className={styles["sidebar-footer"]} ref={ref}>
      <RunSettingGroup />
      {/* 目盛りと円はひとまとまりで右へ寄せる（サイドバーが狭くて折り返すときも、2つが離れずに次の行の右端へ移る）。 */}
      <div className={styles["sidebar-footer-usage"]}>
        <ContextUsageGauge
          usage={contextUsage}
          open={open}
          detailId={detailId}
          onToggle={onToggle}
        />
        <span className={styles["sidebar-footer-divider"]} aria-hidden="true" />
        <PlanUsageGauge planUsage={planUsage} open={open} detailId={detailId} onToggle={onToggle} />
      </div>
      {open && (
        <div
          id={detailId}
          className={styles["sidebar-footer-detail"]}
          role="region"
          aria-label={DETAIL_LABEL}
        >
          <ContextUsageRow usage={contextUsage} />
          <PlanUsageRow planUsage={planUsage} />
        </div>
      )}
    </div>
  )
}

/**
 * 「文脈 7%」と細い目盛り。目盛りの縦の線は自動圧縮が始まる位置。
 * 70%以上は字と目盛りを `--state-warn` にする。
 */
function ContextUsageGauge(props: {
  readonly usage: UseContextUsageResult
  readonly open: boolean
  readonly detailId: string
  readonly onToggle: () => void
}): ReactElement {
  const { usage } = props
  const percentage = usage.kind === "ready" ? `${String(usage.percentage)}%` : PLACEHOLDER
  const compactAt =
    usage.kind === "ready" && usage.maxTokens > 0
      ? Math.min(((usage.totalTokens + usage.untilCompactTokens) / usage.maxTokens) * 100, 100)
      : undefined

  return (
    <button
      type="button"
      className={clsx(
        styles["usage-gauge"],
        styles["context-gauge"],
        isContextUsageWarn(usage) && styles["is-warn"],
      )}
      aria-label={contextGaugeLabel(usage)}
      aria-expanded={props.open}
      aria-controls={props.detailId}
      aria-busy={usage.kind === "pending" ? "true" : undefined}
      title="コンテキスト"
      onClick={props.onToggle}
    >
      <span className={styles["context-gauge-figure"]}>
        <span className={styles["usage-gauge-label"]}>文脈</span>
        <span className={styles["usage-gauge-value"]}>{percentage}</span>
      </span>
      <span className={styles["context-gauge-track"]} aria-hidden="true">
        <span
          className={styles["context-gauge-fill"]}
          style={{
            width: `${String(usage.kind === "ready" ? Math.min(usage.percentage, 100) : 0)}%`,
          }}
        />
        {compactAt !== undefined && (
          <span
            className={styles["context-gauge-compact"]}
            style={{ left: `${String(compactAt)}%` }}
          />
        )}
      </span>
    </button>
  )
}

/** 5時間枠と7日間枠を、塗った扇の円と割合で並べる。80%以上の枠は扇と字を `--state-warn` にする。 */
function PlanUsageGauge(props: {
  readonly planUsage: UsePlanUsageResult
  readonly open: boolean
  readonly detailId: string
  readonly onToggle: () => void
}): ReactElement {
  const { state, fetching } = props.planUsage
  const windows = windowsOf(state)

  return (
    <button
      type="button"
      className={clsx(styles["usage-gauge"], styles["plan-gauge"])}
      aria-label={planGaugeLabel(windows)}
      aria-expanded={props.open}
      aria-controls={props.detailId}
      aria-busy={fetching ? "true" : undefined}
      title="利用枠"
      onClick={props.onToggle}
    >
      <PlanWindowPie label="5h" window={windows?.fiveHour} />
      <PlanWindowPie label="7d" window={windows?.sevenDay} />
    </button>
  )
}

/** 枠1つぶんの円と割合。取れていない枠は扇を塗らず、割合を「—」にする。 */
function PlanWindowPie(props: {
  readonly label: string
  readonly window: WindowDisplay | undefined
}): ReactElement {
  const utilization = props.window?.utilization
  const warn = props.window !== undefined && isPlanWindowWarn(props.window)
  return (
    <span className={clsx(styles["plan-gauge-window"], warn && styles["is-warn"])}>
      <svg
        className={styles["plan-gauge-pie"]}
        width="22"
        height="22"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <circle className={styles["plan-gauge-pie-track"]} cx="10" cy="10" r="9" />
        {utilization !== undefined && utilization > 0 && (
          <path className={styles["plan-gauge-pie-fill"]} d={pieSlicePath(utilization)} />
        )}
        <circle className={styles["plan-gauge-pie-hub"]} cx="10" cy="10" r="1.3" />
      </svg>
      <span className={styles["plan-gauge-figure"]}>
        <span className={styles["usage-gauge-label"]}>{props.label}</span>
        <span className={styles["usage-gauge-value"]}>
          {utilization === undefined ? PLACEHOLDER : `${String(Math.round(utilization))}%`}
        </span>
      </span>
    </span>
  )
}

/** 中心 (10, 10)・半径 9 の円で、真上から時計回りに `percentage` ぶんの扇を描く道筋。100% 以上は円そのもの。 */
function pieSlicePath(percentage: number): string {
  if (percentage >= 100) {
    return "M10 1 A9 9 0 1 1 9.99 1 Z"
  }
  const angle = (percentage / 100) * 2 * Math.PI
  const x = 10 + 9 * Math.sin(angle)
  const y = 10 - 9 * Math.cos(angle)
  const largeArc = percentage > 50 ? 1 : 0
  return `M10 10 L10 1 A9 9 0 ${String(largeArc)} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`
}

/** 目盛りの口の名前。数がある ready だけ割合と量を読む。 */
function contextGaugeLabel(usage: UseContextUsageResult): string {
  if (usage.kind === "pending") {
    return "コンテキスト 取得中"
  }
  if (usage.kind === "unavailable") {
    return "コンテキストは取れていない"
  }
  return `コンテキスト ${String(usage.percentage)}%（${formatCount(usage.totalTokens)} / ${formatCount(usage.maxTokens)}）`
}

/** 円の口の名前。取れない・該当しないときはそれだけを言う（詳しい理由は開いた面の札が持つ）。 */
function planGaugeLabel(
  windows: { readonly fiveHour: WindowDisplay; readonly sevenDay: WindowDisplay } | undefined,
): string {
  if (windows === undefined) {
    return "利用枠 取れていない"
  }
  return `利用枠 5時間 ${windowPercentage(windows.fiveHour)}・7日間 ${windowPercentage(windows.sevenDay)}`
}

function windowPercentage(window: WindowDisplay): string {
  return window.utilization === undefined
    ? PLACEHOLDER
    : `${String(Math.round(window.utilization))}%`
}
