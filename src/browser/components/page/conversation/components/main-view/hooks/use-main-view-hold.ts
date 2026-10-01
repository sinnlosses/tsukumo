// 利用者がメインビューを読んでいるあいだ（中にフォーカスがある・転がしている最中）を、保留の理由として store へ書く。
// 転がる祖先は画面の幅で入れ替わる（広い画面は領域、狭い画面はページ自身）ので、`document` で捕まえて根との位置関係で選ぶ。

import { useEffect, type RefObject } from "react"

import { useMainViewContent } from "../../../../../../stores/main-view-content.ts"

export function useMainViewHold(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const found = rootRef.current
    if (found === null) {
      return
    }
    const root: HTMLElement = found
    const { setHold } = useMainViewContent.getState()

    function onFocusIn(): void {
      setHold("focus", true)
    }
    function onFocusOut(event: FocusEvent): void {
      if (!(event.relatedTarget instanceof Node && root.contains(event.relatedTarget))) {
        setHold("focus", false)
      }
    }
    function onScroll(event: Event): void {
      if (scrollsRoot(root, event.target)) {
        setHold("scroll", true)
      }
    }
    function onScrollEnd(event: Event): void {
      if (scrollsRoot(root, event.target)) {
        setHold("scroll", false)
      }
    }

    setHold("focus", root.contains(document.activeElement))
    root.addEventListener("focusin", onFocusIn)
    root.addEventListener("focusout", onFocusOut)
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    document.addEventListener("scrollend", onScrollEnd, { capture: true, passive: true })
    return () => {
      root.removeEventListener("focusin", onFocusIn)
      root.removeEventListener("focusout", onFocusOut)
      document.removeEventListener("scroll", onScroll, { capture: true })
      document.removeEventListener("scrollend", onScrollEnd, { capture: true })
      setHold("focus", false)
      setHold("scroll", false)
    }
  }, [rootRef])
}

function scrollsRoot(root: HTMLElement, target: EventTarget | null): boolean {
  if (target === document) {
    return true
  }
  return target instanceof Node && (target.contains(root) || root.contains(target))
}
