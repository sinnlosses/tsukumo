// `<ConversationLayout>` のロジック。
// 2本の仕切りの幅（`Split`）を state に持ち、CSS カスタムプロパティの `style` と仕切りに渡す呼び先へ畳む。
//
// 仕切りの位置が state に入るのはドラッグを離した1回だけ。
// 動かしている間の位置は過渡的な値で、効くのは CSS カスタムプロパティだけなので、pointermove の間は DOM へ直接書く（`on*Change`）。
// 離した瞬間に呼ばれる `on*Commit` だけが state を更新し、`saveSplit` で保存する。

import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
  type RefObject,
} from "react"

import { useEventListener } from "../../../../../../hooks/use-event-listener.ts"
import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import { usePopover } from "../../../../../../hooks/use-popover.ts"
import { useLayoutSplitReset } from "../../../../../../stores/layout-split-reset.ts"
import { reportSplitRelease } from "../domain/split-release-report.ts"
import { DEFAULT_SPLIT, loadSplit, saveSplit, type Split } from "../domain/split.ts"

// 柱を出す中くらいのビューポート幅の `@media` と同じ字にする。
const RAIL_TIER_QUERY = "(min-width: 761px) and (max-width: 1100px)"

// 幅を持つ CSS カスタムプロパティ。CSS 側のフォールバック値（conversation-layout.module.css）は `DEFAULT_SPLIT` と一致させること。
const LEFT_WIDTH_VARIABLE = "--layout-left-width"
const SIDEBAR_WIDTH_VARIABLE = "--layout-sidebar-width"

export type UseConversationLayoutResult = {
  readonly splitters: {
    /** 2本の仕切りが動かす器（左の列・中央・サイドバーを包む要素）と、確定済みの幅の `style`。 */
    readonly gridRef: RefObject<HTMLDivElement | null>
    readonly gridStyle: CSSProperties
    /** 左の列と中央の境界。値は px。 */
    readonly left: {
      readonly onChange: (px: number) => void
      readonly onCommit: (px: number) => void
    }
    /** 中央とサイドバーの境界。値は器の幅に対する %（サイドバーの幅）。 */
    readonly sidebar: {
      readonly onChange: (percent: number) => void
      readonly onCommit: (percent: number) => void
    }
    /** 仕切りのダブルクリックで呼ぶ。左の列の幅とサイドバーの幅の両方を既定に戻す。 */
    readonly onReset: () => void
  }
  readonly sidebarDisclosure: {
    /** 柱とサイドバーを包む要素。この外を押すと、柱から開いたサイドバーが閉じる。 */
    readonly rootRef: RefObject<HTMLDivElement | null>
    readonly id: string
    /** 中くらいのビューポート幅で、柱からサイドバーを重ねて開いているか。 */
    readonly open: boolean
    readonly onToggle: () => void
    readonly toggleRef: RefCallback<HTMLButtonElement>
  }
}

export function useConversationLayout(): UseConversationLayoutResult {
  const [split, setSplit] = useState<Split>(loadSplit)
  const resetSignal = useLayoutSplitReset((state) => state.signal)
  // 開いた時点の回数。これより増えたときだけ戻す（開くたびに戻らないように）。
  const handledResetSignal = useRef(resetSignal)
  const gridRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef<HTMLDivElement>(null)
  const sidebarId = useId()
  const sidebar = usePopover({ rootRef: sideRef, onReset: () => {} })
  const { open: sidebarOpen, close: closeSidebar } = sidebar

  const [tier] = useState(() => window.matchMedia(RAIL_TIER_QUERY))
  useEventListener(
    tier,
    "change",
    () => {
      if (!tier.matches) {
        closeSidebar()
      }
    },
    { enabled: sidebarOpen },
  )

  // 仕切りを離したとき・既定に戻すときだけ通る、幅の唯一の更新点。
  function commitSplit(next: Split): void {
    setSplit(next)
    saveSplit(next)
  }

  useExternalSync(() => {
    if (resetSignal !== handledResetSignal.current) {
      handledResetSignal.current = resetSignal
      commitSplit(DEFAULT_SPLIT)
    }
  }, [resetSignal])

  return {
    splitters: {
      gridRef,
      gridStyle: {
        [LEFT_WIDTH_VARIABLE]: `${String(split.leftPx)}px`,
        [SIDEBAR_WIDTH_VARIABLE]: `${String(split.sidebar)}%`,
      },
      left: {
        onChange: (px) => {
          gridRef.current?.style.setProperty(LEFT_WIDTH_VARIABLE, `${String(px)}px`)
        },
        onCommit: (px) => {
          commitSplit({ ...split, leftPx: px })
        },
      },
      sidebar: {
        onChange: (percent) => {
          gridRef.current?.style.setProperty(SIDEBAR_WIDTH_VARIABLE, `${String(percent)}%`)
        },
        onCommit: (percent) => {
          // 体験の記録の語彙は「メインの幅の比」のまま（左の列は px で記録の形に合わないので送らない）。
          reportSplitRelease("topLeft", 100 - percent, 100 - split.sidebar)
          commitSplit({ ...split, sidebar: percent })
        },
      },
      onReset: () => {
        commitSplit(DEFAULT_SPLIT)
      },
    },
    sidebarDisclosure: {
      rootRef: sideRef,
      id: sidebarId,
      open: sidebarOpen,
      onToggle: sidebar.onToggle,
      toggleRef: sidebar.toggleRef,
    },
  }
}
