// サイドバーの下端の帯のロジック。
// コンテキストの使用量と利用枠はここで1回だけ取って、目盛りと詳しい面の両方へ配る（取り直しを2重にしない）。
// コンテキストはトークン消費の画面の札と同じ `refetchKey` を渡すので、`useQuery` の cache 1本に相乗りする。
//
// 取り直しのあいだは目盛りの口に `aria-busy` を立てる（面を閉じていても立つ）。
// E2E の「DOM が落ち着くまで待つ」判定はこれを見て、ターンの終わりに始まった取り直しが終わるまで撮らない。

import { useId, useRef, useState, type RefObject } from "react"

import {
  contextUsageRefetchKey,
  type UseContextUsageResult,
  useContextUsage,
} from "../../../../domain/context-usage.ts"
import { useDismissSignal } from "../../../../hooks/use-dismiss-signal.ts"
import { useSession } from "../../../../stores/session.ts"
import { formatCount } from "../../../../utils/format-count.ts"
import { isContextUsageWarn } from "../domain/context-usage-warn.ts"
import { isPlanWindowWarn, windowsOf, type WindowDisplay } from "../domain/plan-window.ts"
import { planUsageRefetchKey, type UsePlanUsageResult, usePlanUsage } from "./use-plan-usage.ts"

const PLACEHOLDER = "—"

/** 「文脈 7%」の目盛り。`compact` は自動圧縮が始まる位置（目盛りの縦の線）。 */
export type ContextGauge = {
  readonly label: string
  readonly percentageText: string
  /** 塗る幅（%）。 */
  readonly fillWidth: number
  readonly compact: { readonly kind: "none" } | { readonly kind: "at"; readonly position: number }
  readonly warn: boolean
  readonly busy: boolean
}

/** 枠1つぶんの円と割合。 */
export type PlanWindowPieView = {
  readonly label: string
  readonly percentageText: string
  readonly slice: { readonly kind: "none" } | { readonly kind: "path"; readonly d: string }
  readonly warn: boolean
}

export type PlanGauge = {
  readonly label: string
  readonly busy: boolean
  readonly fiveHour: PlanWindowPieView
  readonly sevenDay: PlanWindowPieView
}

export type SidebarFooterView = {
  readonly ref: RefObject<HTMLDivElement | null>
  readonly open: boolean
  readonly detailId: string
  readonly onToggle: () => void
  readonly contextUsage: UseContextUsageResult
  readonly planUsage: UsePlanUsageResult
  readonly contextGauge: ContextGauge
  readonly planGauge: PlanGauge
}

export function useSidebarFooter(): SidebarFooterView {
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

  return {
    ref,
    open,
    detailId,
    onToggle: () => {
      setOpen((wasOpen) => !wasOpen)
    },
    contextUsage,
    planUsage,
    contextGauge: toContextGauge(contextUsage),
    planGauge: toPlanGauge(planUsage),
  }
}

function toContextGauge(usage: UseContextUsageResult): ContextGauge {
  return {
    label: contextGaugeLabel(usage),
    percentageText: usage.kind === "ready" ? `${String(usage.percentage)}%` : PLACEHOLDER,
    fillWidth: usage.kind === "ready" ? Math.min(usage.percentage, 100) : 0,
    compact:
      usage.kind === "ready" && usage.maxTokens > 0
        ? {
            kind: "at",
            position: Math.min(
              ((usage.totalTokens + usage.untilCompactTokens) / usage.maxTokens) * 100,
              100,
            ),
          }
        : { kind: "none" },
    warn: isContextUsageWarn(usage),
    busy: usage.kind === "pending",
  }
}

function toPlanGauge(planUsage: UsePlanUsageResult): PlanGauge {
  const windows = windowsOf(planUsage.state)
  return {
    label: planGaugeLabel(windows),
    busy: planUsage.fetching,
    fiveHour: toPlanWindowPie("5h", windows?.fiveHour),
    sevenDay: toPlanWindowPie("7d", windows?.sevenDay),
  }
}

/** 取れていない枠は扇を塗らず、割合を「—」にする。 */
function toPlanWindowPie(label: string, window: WindowDisplay | undefined): PlanWindowPieView {
  const utilization = window?.utilization
  return {
    label,
    percentageText: utilization === undefined ? PLACEHOLDER : `${String(Math.round(utilization))}%`,
    slice:
      utilization !== undefined && utilization > 0
        ? { kind: "path", d: pieSlicePath(utilization) }
        : { kind: "none" },
    warn: window !== undefined && isPlanWindowWarn(window),
  }
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
