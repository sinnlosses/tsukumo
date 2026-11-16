// サイドバーの下端の帯のロジック。
// コンテキストの使用量とプラン使用量はここで1回だけ取って、目盛りと詳しい面の両方へ配る（取り直しを2重にしない）。
// コンテキストはトークン消費の画面の札と同じ `refetchKey` を渡すので、`useQuery` の cache 1本に相乗りする。
//
// 取り直しのあいだは目盛りの口に `aria-busy` を立てる（面を閉じていても立つ）。
// E2E の「DOM が落ち着くまで待つ」判定はこれを見て、ターンの終わりに始まった取り直しが終わるまで撮らない。
// 目盛りの口には、出している値を取ったときの `finishedTurnCount` を `data-finished-turn-count` に出す（値を出していない間は出さない）。

import { useId, useRef, useState, type RefObject } from "react"

import { type UseContextUsageResult, useContextUsage } from "../../../../domain/context-usage.ts"
import { useDismissSignal } from "../../../../hooks/use-dismiss-signal.ts"
import { rpc } from "../../../../stores/rpc.ts"
import { useSession } from "../../../../stores/session.ts"
import { formatCount } from "../../../../utils/format-count.ts"
import { isContextUsageWarn } from "../domain/context-usage-warn.ts"
import { isPlanWindowWarn, windowsOf, type WindowDisplay } from "../domain/plan-window.ts"
import type { UsageSource } from "../domain/usage-source.ts"
import { type UsePlanUsageResult, usePlanUsage } from "./use-plan-usage.ts"

const PLACEHOLDER = "—"

/**
 * 「コンテキスト 61%」のように、語・割合・細い棒で出す帯の1つ分。コンテキスト・5時間・7日の3つが同じ形。
 * `compact` は自動圧縮が始まる位置（棒の縦の線）で、コンテキストだけが持つ。
 */
export type UsageMeterView = {
  /** 語。目盛りの字と `title` に同じものを使う。 */
  readonly word: string
  readonly ariaLabel: string
  readonly percentageText: string
  /** 塗る幅（%）。 */
  readonly fillWidth: number
  readonly compact: { readonly kind: "none" } | { readonly kind: "at"; readonly position: number }
  readonly warn: boolean
  readonly busy: boolean
  readonly source: UsageSource
}

export type ContextGauge = UsageMeterView

export type PlanGauge = {
  readonly fiveHour: UsageMeterView
  readonly sevenDay: UsageMeterView
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
  const finishedTurnCount = useSession((session) => session.state.finishedTurnCount)
  const contextUsage = useContextUsage(rpc.contextUsage.report, finishedTurnCount)
  const planUsage = usePlanUsage(finishedTurnCount)
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
    contextGauge: toContextGauge(contextUsage, finishedTurnCount),
    planGauge: toPlanGauge(planUsage),
  }
}

/** `useContextUsage` は前の鍵の値を持ち越さないので、値を出していればいまの鍵で取った値。 */
function toContextGauge(usage: UseContextUsageResult, finishedTurnCount: number): ContextGauge {
  return {
    word: "コンテキスト",
    ariaLabel: contextGaugeLabel(usage),
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
    source: usage.kind === "pending" ? { kind: "none" } : { kind: "after", finishedTurnCount },
  }
}

function toPlanGauge(planUsage: UsePlanUsageResult): PlanGauge {
  const windows = windowsOf(planUsage.state)
  const unreadable: WindowDisplay = {
    utilization: undefined,
    resetsAt: undefined,
  }
  const shown = windows ?? { fiveHour: unreadable, sevenDay: unreadable }
  const meter = (word: string, window: WindowDisplay): UsageMeterView =>
    toPlanWindowMeter(word, window, windows !== undefined, planUsage)
  return {
    fiveHour: meter("5時間", shown.fiveHour),
    sevenDay: meter("7日", shown.sevenDay),
  }
}

/** 取れていない枠は棒を塗らず、割合を「—」にする。 */
function toPlanWindowMeter(
  word: string,
  window: WindowDisplay,
  readable: boolean,
  planUsage: UsePlanUsageResult,
): UsageMeterView {
  const utilization = window.utilization
  const percentageText =
    utilization === undefined ? PLACEHOLDER : `${String(Math.round(utilization))}%`
  return {
    word,
    ariaLabel: readable ? `${word} ${percentageText}` : `${word}は取れていない`,
    percentageText,
    fillWidth: utilization === undefined ? 0 : Math.min(Math.max(utilization, 0), 100),
    compact: { kind: "none" },
    warn: isPlanWindowWarn(window),
    busy: planUsage.fetching,
    source: planUsage.source,
  }
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
