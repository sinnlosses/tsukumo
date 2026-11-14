// 頭の外寸を測り、板の高さの上限が引く `--phone-head-height` をページの根に書く ref コールバック。

import type { RefCallback } from "react"

import { useHeightVariableRef } from "../../../../hooks/use-height-variable-ref.ts"

const HEIGHT_PROPERTY = "--phone-head-height"

export function usePhoneHeadHeight(): RefCallback<HTMLElement> {
  return useHeightVariableRef(HEIGHT_PROPERTY, () => document.documentElement)
}
