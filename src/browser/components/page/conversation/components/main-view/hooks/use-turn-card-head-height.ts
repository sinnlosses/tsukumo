// 札の頭（進み具合の帯）の外寸を測り、メインビューの根の `--turn-card-head-height` に書く ref コールバック。

import type { RefCallback } from "react"

import { useHeightVariableRef } from "../../../../../../hooks/use-height-variable-ref.ts"
import { mainViewRootOf } from "../../../domain/main-view-focus.ts"

const HEIGHT_PROPERTY = "--turn-card-head-height"

export function useTurnCardHeadHeight(): RefCallback<HTMLElement> {
  return useHeightVariableRef(HEIGHT_PROPERTY, mainViewRootOf)
}
