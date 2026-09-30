// 帯の札を押すと開くポップオーバーの開閉。
// 札は広い画面の帯と「≡」の面の2箇所に描かれるので、押した口はコールバック ref で集める。

import { useRef, useState, type RefCallback, type RefObject } from "react"

import { useDismissSignal, type DismissCause } from "../../../../hooks/use-dismiss-signal.ts"

export type NavPopover = {
  readonly open: boolean
  readonly onToggle: () => void
  /** フォーカスは動かさずに閉じる。 */
  readonly close: () => void
  readonly toggleRef: RefCallback<HTMLButtonElement>
}

export type NavPopoverOptions = {
  /** 帯全体（`<nav>`）。外側を押したかの判定に使う。 */
  readonly navRef: RefObject<HTMLElement | null>
  /** 開閉が変わるたびに、開閉の直後に呼ぶ。 */
  readonly onReset: () => void
}

export function useNavPopover(options: NavPopoverOptions): NavPopover {
  const { navRef, onReset } = options
  const [open, setOpen] = useState(false)
  const toggleNodes = useRef(new Set<HTMLButtonElement>())

  function onToggle(): void {
    setOpen((wasOpen) => !wasOpen)
    onReset()
  }

  function close(): void {
    setOpen(false)
    onReset()
  }

  const toggleRef: RefCallback<HTMLButtonElement> = (node) => {
    // cleanup を返す形なので React 19 は `null` で呼び直さない（外れるのは下の cleanup）。
    if (node === null) {
      return
    }
    const nodes = toggleNodes.current
    nodes.add(node)
    return () => {
      nodes.delete(node)
    }
  }

  function onDismiss(cause: DismissCause): void {
    close()
    if (cause === "escape") {
      // 押せる状態にある札は1つだけ（もう片方は `display: none` で `.focus()` が効かない）。
      for (const node of toggleNodes.current) {
        node.focus()
      }
    }
  }

  useDismissSignal({ open, rootRef: navRef, onDismiss })

  return { open, onToggle, close, toggleRef }
}
