// お願いの欄がビューポートに見えているかを読んで store に書く ref コールバック。
// 欄の一部でも見えていれば見えている。欄が外れるときはお願いなしに戻す。
// 欄の中で押された Esc は、入力欄へフォーカスを戻す（欄へは入力欄の ↑ で移れる）。

import type { RefCallback } from "react"

import { useIntersectionObservedRef } from "../../../../../../hooks/use-observed-ref.ts"
import { returnFocusToComposerOnEscape } from "../../../../../../stores/composer-focus.ts"
import { useFavorVisibility as useFavorVisibilityStore } from "../../../stores/favor-visibility.ts"

export function useFavorVisibility(): RefCallback<HTMLElement> {
  const observe = useIntersectionObservedRef<HTMLElement>({
    enabled: true,
    onIntersect: (entries) => {
      const latest = entries.at(-1)
      if (latest !== undefined) {
        useFavorVisibilityStore.getState().setVisible(latest.isIntersecting)
      }
    },
    init: (element) => {
      useFavorVisibilityStore.getState().attach(element.id)
      return {}
    },
    onDetach: () => {
      useFavorVisibilityStore.getState().detach()
    },
  })
  return (element) => {
    if (element === null) {
      return undefined
    }
    const stopObserving = observe(element)
    element.addEventListener("keydown", returnFocusToComposerOnEscape)
    return () => {
      element.removeEventListener("keydown", returnFocusToComposerOnEscape)
      stopObserving?.()
    }
  }
}
