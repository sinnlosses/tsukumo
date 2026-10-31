// React の外への書き込み・外からの読み込み・タイマーを、値が変わるたびに同期し直す effect。
// `deps` は省けない。

import { useEffect, useEffectEvent, type DependencyList } from "react"

export function useExternalSync(effect: () => void | (() => void), deps: DependencyList): void {
  const run = useEffectEvent(effect)
  useEffect(() => run(), deps)
}
