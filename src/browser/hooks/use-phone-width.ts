// 窓が狭い画面の幅（760px 以下）か。

import { useMediaQuery } from "./use-media-query.ts"

export const PHONE_QUERY = "(max-width: 760px)"

export function usePhoneWidth(): boolean {
  return useMediaQuery(PHONE_QUERY)
}

export function isPhoneWidth(): boolean {
  return window.matchMedia(PHONE_QUERY).matches
}
