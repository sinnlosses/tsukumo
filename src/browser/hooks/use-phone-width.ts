// 窓が狭い画面の幅（760px 以下）か。

import { useSyncExternalStore } from "react"

export const PHONE_QUERY = "(max-width: 760px)"

export function usePhoneWidth(): boolean {
  return useSyncExternalStore(subscribe, isPhoneWidth, readServer)
}

export function isPhoneWidth(): boolean {
  return window.matchMedia(PHONE_QUERY).matches
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener("change", onChange)
  return () => {
    query.removeEventListener("change", onChange)
  }
}

function readServer(): boolean {
  return false
}
