// 描画の前に DOM を測る・書く effect。ちらつきを避けるときだけ使う。
// `deps` は省けない。描画のあとで足りる同期は `useExternalSync`。

import { useEffectEvent, useLayoutEffect, type DependencyList } from "react"

export function useBeforePaintSync(effect: () => void | (() => void), deps: DependencyList): void {
  const run = useEffectEvent(effect)
  useLayoutEffect(() => run(), deps)
}
