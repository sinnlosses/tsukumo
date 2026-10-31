// CSS のメディアクエリが今合っているか。変化に追随する。

import { useSyncExternalStore } from "react"

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => {
        list.removeEventListener("change", onChange)
      }
    },
    () => window.matchMedia(query).matches,
    readServer,
  )
}

function readServer(): boolean {
  return false
}
