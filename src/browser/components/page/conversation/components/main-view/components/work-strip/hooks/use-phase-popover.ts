// 進み具合の帯の段の丸を押すと開く吹き出しの開閉と、吹き出しを押した丸の下へ置く位置決め。
// 開くのは同時に1つで、Esc・丸の並びの外での押下で閉じる。

import { useRef, useState, type RefCallback, type RefObject } from "react"

import {
  useDismissSignal,
  type DismissCause,
} from "../../../../../../../../hooks/use-dismiss-signal.ts"

/**
 * 吹き出しを開ける範囲。`shown` は帯が出ているやり取り `exchange` と、いまの段の丸の `keys`。
 * 開いた丸がこの範囲に無くなれば（やり取りが替わる・帯が消える・丸が並びから消える）閉じて見える。
 */
export type PhasePopoverScope =
  | { readonly kind: "hidden" }
  | { readonly kind: "shown"; readonly exchange: number; readonly keys: readonly string[] }

export type PhasePopover = {
  /** 開いている丸の `key`。閉じていれば `undefined`。 */
  readonly openKey: string | undefined
  /** 同じ丸なら閉じ、違う丸なら開き替える。 */
  readonly toggle: (key: string) => void
  /** フォーカスは動かさずに閉じる。 */
  readonly close: () => void
  /** 丸の並び（`ol`）に付ける。この外での押下で閉じる。 */
  readonly trackRef: RefObject<HTMLOListElement | null>
  /** 吹き出しに付ける。直前の兄弟の丸の下へ、帯の左右の端からはみ出さないように置く。 */
  readonly placeRef: RefCallback<HTMLDivElement>
}

type Opened =
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly exchange: number; readonly key: string }

/** 帯の左右の端から空ける幅（px）。 */
const EDGE_PX = 8
/** 吹き出しの左端を丸の中心から左へずらす幅（px）。 */
const LEAD_PX = 40
/** 丸の下端と吹き出しの上端のあき（px）。 */
const GAP_PX = 8

export function usePhasePopover(scope: PhasePopoverScope): PhasePopover {
  const [opened, setOpened] = useState<Opened>({ kind: "closed" })
  const trackRef = useRef<HTMLOListElement>(null)
  const openKey =
    opened.kind === "open" &&
    scope.kind === "shown" &&
    opened.exchange === scope.exchange &&
    scope.keys.includes(opened.key)
      ? opened.key
      : undefined
  // 範囲から外れた時点で開いた丸を捨てる（同じやり取りで帯や丸が戻っても開き直さない）。
  if (opened.kind === "open" && openKey === undefined) {
    setOpened({ kind: "closed" })
  }

  function toggle(key: string): void {
    if (scope.kind !== "shown") {
      return
    }
    setOpened(
      openKey === key ? { kind: "closed" } : { kind: "open", exchange: scope.exchange, key },
    )
  }

  function close(): void {
    setOpened({ kind: "closed" })
  }

  function onDismiss(cause: DismissCause): void {
    if (cause === "escape") {
      trackRef.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus()
    }
    close()
  }

  useDismissSignal({ open: openKey !== undefined, rootRef: trackRef, onDismiss })

  return { openKey, toggle, close, trackRef, placeRef: placeBelowDot }
}

function placeBelowDot(node: HTMLDivElement | null): void {
  if (node === null) {
    return
  }
  const dot = node.previousElementSibling
  const strip = node.offsetParent
  if (!(dot instanceof HTMLElement) || !(strip instanceof HTMLElement)) {
    return
  }
  const dotRect = dot.getBoundingClientRect()
  const stripRect = strip.getBoundingClientRect()
  const center = dotRect.left - stripRect.left + dotRect.width / 2
  const left = Math.max(
    EDGE_PX,
    Math.min(center - LEAD_PX, stripRect.width - node.offsetWidth - EDGE_PX),
  )
  node.style.top = `${String(dotRect.bottom - stripRect.top + GAP_PX)}px`
  node.style.left = `${String(left)}px`
  node.style.setProperty("--work-strip-pop-arrow", `${String(center - left)}px`)
}
