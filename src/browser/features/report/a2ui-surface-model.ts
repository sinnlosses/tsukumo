// 面の型と、面に部品を足す手。面のカタログ（React 実装）は引かない。

import type { ReactComponentImplementation } from "@a2ui/react/v0_9"
import type { MessageProcessor, SurfaceModel } from "@a2ui/web_core/v0_9"
import type { RefCallback } from "react"

import type { A2uiReportComponent } from "../../../shared/report/a2ui-report-catalog.ts"
import type { MainViewDraftPending } from "../../../shared/session/main-view-draft-pending.ts"
import type {
  MainViewA2uiReport,
  MainViewReportRegions,
} from "../../../shared/session/main-view-shape.ts"
import type { NextStepsOrigin } from "./leaf/next-step-row.tsx"

export const SURFACE_ID = "report"

export type SurfaceView = Extract<MainViewA2uiReport, { readonly kind: "surface" }>

/**
 * 書いている途中の草稿が渡す、まだ届いていない部品（骨組みを置く場所）。
 * `blink` は、骨組みを明滅させるか（動きを止める設定では偽）。
 */
export type ReportPending = MainViewDraftPending & { readonly blink: boolean }

export type A2uiReportProps = {
  readonly body: MainViewReportRegions
  readonly view: SurfaceView
  readonly reveal: boolean
  readonly turnId: number
  readonly className: string
  /** 書き上げの演出が付けるポンの class。 */
  readonly revealClassName: string
  /** 本文の根に重ねて付ける class（置く側のステップの末尾の余白の打ち消しが指す綴り）。 */
  readonly blockClassName: string
  readonly nextSteps?: NextStepsOrigin
  readonly favorRef?: RefCallback<HTMLElement>
  readonly reportToolUseId?: string
  readonly pending?: ReportPending
}

/** 紙の描画順（図・本文の節・振り返り）の、根の子の id。 */
export function renderOrderIdsOf(view: SurfaceView): readonly string[] {
  const leafIds = (region: SurfaceView["figure"]): readonly string[] =>
    region.kind === "leaves"
      ? region.entries.flatMap((entry) => (entry.kind === "leaf" ? [entry.id] : []))
      : []
  const sectionIds = Object.entries(view.sections)
    .toSorted(([, left], [, right]) => left.regionId - right.regionId)
    .map(([id]) => id)
  return [...leafIds(view.figure), ...sectionIds, ...leafIds(view.retrospective)]
}

/**
 * 一覧から作った面。A2UI の検証が一覧を拒んだら（`processMessages` が投げる）`failed` にする（1件の本文のために画面を落とさない）。
 */
export type ReportSurface =
  | {
      readonly kind: "surface"
      readonly processor: MessageProcessor<ReactComponentImplementation>
      readonly surface: SurfaceModel<ReactComponentImplementation>
    }
  | { readonly kind: "failed"; readonly error: unknown }

/** 面にまだ無い部品を足す。A2UI の検証が拒んだら（`processMessages` が投げる）、それまでの面のままにする。 */
export function addMissingComponents(
  surface: Extract<ReportSurface, { readonly kind: "surface" }>,
  components: readonly A2uiReportComponent[],
): void {
  const missing = components.filter(
    (part) => surface.surface.componentsModel.get(part.id) === undefined,
  )
  if (missing.length === 0) {
    return
  }
  try {
    surface.processor.processMessages([
      { version: "v0.9", updateComponents: { surfaceId: SURFACE_ID, components: [...missing] } },
    ])
  } catch {
    // 足せなかった部品は面の外のまま。描く側は一覧から引くので、本文は伸びた一覧で描かれる。
  }
}
