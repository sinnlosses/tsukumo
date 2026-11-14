// 部品の一覧（`a2ui` の版）のレポート本文を、`@a2ui/react` の面とカタログの React 実装で描く。
//
// 部品ごとに挟まる `display: contents` の入れ物（`a2ui-react-<部品名>`）を根の1枚だけにし、欄と塊の入れ子を既定の描画と同じにする。
// 面の最初の描画は読み込み中の札なので、演出の根は `Report` の実装の中に置く（マウントした時点で本文が揃う）。

import {
  A2uiSurface,
  createComponentImplementation,
  type ReactComponentImplementation,
} from "@a2ui/react/v0_9"
import { Catalog, MessageProcessor, type SurfaceModel } from "@a2ui/web_core/v0_9"
import { type ReactElement, useState } from "react"

import type { A2uiReportComponent } from "../../../shared/report/a2ui-report-catalog.ts"
import { a2uiPartsById } from "../../../shared/report/a2ui-report-outline.ts"
import { useExternalSync } from "../../hooks/use-external-sync.ts"
import { reportBrowserError } from "../../stores/browser-error-report.ts"
import { type A2uiReportProps, PartView, ReportContext } from "./a2ui-part.tsx"
import { loadReportCatalogApis } from "./domain/a2ui-catalog-load.ts"
import { ReportFrame } from "./leaf/body-region.tsx"
import { NextStepRow } from "./leaf/next-step-row.tsx"
import { NoteBody } from "./leaf/note-leaf.tsx"
import { useReevaluatedLeaves } from "./leaf/parameter-knob.tsx"
import { FavorRegion, HeadRegion } from "./leaf/report-head-region.tsx"
import { PaperReportRoot } from "./paper/paper-report-root.tsx"

/**
 * 本文1つぶんの面。面は本文ごとに1つで、最初の一覧で作る。
 * 草稿のように一覧があとから伸びたら、まだ面に無い部品だけを足す（面は作り直さない）。
 */
export function A2uiReport(props: A2uiReportProps): ReactElement {
  const [surface] = useState(() => reportSurfaceOf(props.view.components))
  const parts = a2uiPartsById(props.view.components)
  const { components } = props.view
  const dataModel = surface.kind === "surface" ? surface.surface.dataModel : undefined
  const leaves = useReevaluatedLeaves(dataModel, props.view.written)
  useExternalSync(() => {
    if (surface.kind === "surface") {
      addMissingComponents(surface, components)
    }
  }, [surface, components])
  if (surface.kind === "failed") {
    return <FailedReport {...props} error={surface.error} />
  }
  return (
    <ReportContext value={{ ...props, parts, dataModel: surface.surface.dataModel, leaves }}>
      <A2uiSurface surface={surface.surface} />
    </ReportContext>
  )
}

/**
 * 面が作れなかった本文。頭とお願いは値から描き、節の代わりに「本文を描けなかった」の印を出す。
 * 原因は診断ログへ送る（運ぶのは経路・`error.name`・スタックの先頭数フレームだけで、本文は入らない）。
 */
function FailedReport(props: A2uiReportProps & { readonly error: unknown }): ReactElement {
  const { view, error } = props
  useExternalSync(() => {
    reportBrowserError("render-failure", error)
  }, [error])
  return (
    <ReportFrame
      reveal={props.reveal}
      turnId={props.turnId}
      className={props.className}
      revealClassName={props.revealClassName}
      blockClassName={props.blockClassName}
    >
      <HeadRegion head={view.head} />
      <NoteBody tone="ng" text="本文を描けませんでした。" inPaper={false} />
      <FavorRegion id={view.favor.id} text={view.favor.text} />
      {props.nextSteps !== undefined && (
        <NextStepRow origin={props.nextSteps} components={view.components} />
      )}
    </ReportFrame>
  )
}

const SURFACE_ID = "report"

/** 部品名 → React 実装。どれも ID で一覧を引いて描く（`buildChild` は使わない）。 */
const REPORT_CATALOG = reportCatalog()

function reportCatalog(): Catalog<ReactComponentImplementation> {
  const apis = loadReportCatalogApis()
  const implementations = [...apis.components.values()].map((api) =>
    api.name === "Report"
      ? createComponentImplementation(api, () => <PaperReportRoot />)
      : createComponentImplementation(api, ({ context }) => (
          <PartView id={context.componentModel.id} />
        )),
  )
  return new Catalog(apis.id, "v0.9", implementations, [])
}

/**
 * 一覧から面を作る。A2UI の検証が一覧を拒んだら（`processMessages` が投げる）`failed` にする（1件の本文のために画面を落とさない）。
 */
type ReportSurface =
  | {
      readonly kind: "surface"
      readonly processor: MessageProcessor<ReactComponentImplementation>
      readonly surface: SurfaceModel<ReactComponentImplementation>
    }
  | { readonly kind: "failed"; readonly error: unknown }

function reportSurfaceOf(components: readonly A2uiReportComponent[]): ReportSurface {
  const processor = new MessageProcessor<ReactComponentImplementation>([REPORT_CATALOG])
  try {
    processor.processMessages([
      { version: "v0.9", createSurface: { surfaceId: SURFACE_ID, catalogId: REPORT_CATALOG.id } },
      { version: "v0.9", updateComponents: { surfaceId: SURFACE_ID, components: [...components] } },
    ])
  } catch (error) {
    return { kind: "failed", error }
  }
  const surface = processor.model.surfacesMap.get(SURFACE_ID)
  return surface === undefined
    ? { kind: "failed", error: new Error("surface-missing") }
    : { kind: "surface", processor, surface }
}

/** 面にまだ無い部品を足す。A2UI の検証が拒んだら（`processMessages` が投げる）、それまでの面のままにする。 */
function addMissingComponents(
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
