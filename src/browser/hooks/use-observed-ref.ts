// 要素に ResizeObserver・IntersectionObserver を付ける ref コールバックを返すフック。
// 要素が付くとき（commit 時、描画の前）に観測を始め、外れるときに切る。
// 渡したコールバックの identity が変わると付け直す（identity の安定は React Compiler に任せる）。

import type { RefCallback } from "react"

/**
 * 付いた直後に1回と、寸法が変わるたびに `onResize` を呼ぶ。外れるとき `onDetach` を呼ぶ。
 * 初回の呼び出しは描画の前に済む。
 */
export function useResizeObservedRef<Element extends HTMLElement>(
  onResize: (element: Element) => void,
  onDetach: (element: Element) => void,
): RefCallback<Element> {
  return (element: Element) => {
    const observer = new ResizeObserver(() => {
      onResize(element)
    })
    observer.observe(element)
    onResize(element)
    return () => {
      observer.disconnect()
      onDetach(element)
    }
  }
}

/**
 * `enabled` が false のあいだは観測しない。`stop` を呼ぶとその要素の観測をやめる。
 * `init` は付いた要素から観測の設定（根・余白）を決める。
 */
export function useIntersectionObservedRef<Element extends HTMLElement>(options: {
  readonly enabled: boolean
  readonly onIntersect: (entries: readonly IntersectionObserverEntry[], stop: () => void) => void
  readonly init: (element: Element) => IntersectionObserverInit
  readonly onDetach: () => void
}): RefCallback<Element> {
  const { enabled, onIntersect, init, onDetach } = options
  return (element: Element) => {
    if (!enabled) {
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      onIntersect(entries, () => {
        observer.disconnect()
      })
    }, init(element))
    observer.observe(element)
    return () => {
      observer.disconnect()
      onDetach()
    }
  }
}
