// 部品の一覧（`a2ui` の版）のレポート本文を、`@a2ui/react` の面とカタログの React 実装で描く。
//
// 自作の部品の子（`Report.children`・`Section.children`）は、カタログ文書が部品の参照として印を付けていないので `buildChild` で解けない。
// `buildChild` を使わず、根の `Report` の実装が一覧をたどって節・葉・配置の部品を描く。
// 部品ごとに挟まる `display: contents` の入れ物（`a2ui-react-<部品名>`）を根の1枚だけにし、欄と塊の入れ子を既定の描画と同じにする。
// 面の最初の描画は読み込み中の札なので、演出の根は `Report` の実装の中に置く（マウントした時点で本文が揃う）。

import {
  A2uiSurface,
  createComponentImplementation,
  type ReactComponentImplementation,
} from "@a2ui/react/v0_9"
import { Catalog, MessageProcessor, type SurfaceModel } from "@a2ui/web_core/v0_9"
import { createContext, type ReactElement, use, useEffect, useState } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import {
  A2UI_ROOT_ID,
  type A2uiReportPart,
  a2uiPartsById,
} from "../../../../../../shared/report/a2ui-report-outline.ts"
import type {
  MainViewA2uiReport,
  MainViewReportRegions,
  MainViewSurfaceLeafRegion,
} from "../../../../../../shared/session/main-view-shape.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { Divider } from "../../../../ui/divider/divider.tsx"
import { arrangedBlockClassNames } from "../markdown/markdown.tsx"
import { ChoicePicker, InteractiveTable } from "./a2ui-interactive-view.tsx"
import { MarkdownReport, RegionBox, RegionChunks, ReportFrame } from "./body-region.tsx"
import { DirectLeaf, directLeafViewOf } from "./direct-leaf-view.tsx"
import { loadReportCatalogApis } from "./domain/a2ui-catalog-load.ts"
import { isPlainHeadingText } from "./domain/plain-heading.ts"
import { FavorRegion, HeadRegion } from "./report-head-region.tsx"

type SurfaceView = Extract<MainViewA2uiReport, { readonly kind: "surface" }>

type A2uiReportProps = {
  readonly body: MainViewReportRegions
  readonly view: SurfaceView
  readonly reveal: boolean
  readonly turnId: number
  readonly className: string
}

/**
 * 本文1つぶんの面。面は本文ごとに1つで、最初の一覧で作る。
 * 草稿のように一覧があとから伸びたら、まだ面に無い部品だけを足す（面は作り直さない）。
 */
export function A2uiReport(props: A2uiReportProps): ReactElement {
  const [surface] = useState(() => reportSurfaceOf(props.view.components))
  const parts = a2uiPartsById(props.view.components)
  const { components } = props.view
  useEffect(() => {
    if (surface.kind === "surface") {
      addMissingComponents(surface, components)
    }
  }, [surface, components])
  if (surface.kind === "failed") {
    return (
      <MarkdownReport
        body={props.body}
        reveal={props.reveal}
        turnId={props.turnId}
        className={props.className}
      />
    )
  }
  return (
    <ReportContext value={{ ...props, parts, dataModel: surface.surface.dataModel }}>
      <A2uiSurface surface={surface.surface} />
    </ReportContext>
  )
}

const SURFACE_ID = "report"

type ReportContextValue = A2uiReportProps & {
  readonly parts: ReadonlyMap<string, A2uiReportComponent>
  readonly dataModel: SurfaceModel<ReactComponentImplementation>["dataModel"]
}

const ReportContext = createContext<ReportContextValue | undefined>(undefined)

/** 部品名 → React 実装。どれも ID で一覧を引いて描く（`buildChild` は使わない）。 */
const REPORT_CATALOG = reportCatalog()

function reportCatalog(): Catalog<ReactComponentImplementation> {
  const apis = loadReportCatalogApis()
  const implementations = [...apis.components.values()].map((api) =>
    api.name === "Report"
      ? createComponentImplementation(api, () => <ReportRoot />)
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
  | { readonly kind: "failed" }

function reportSurfaceOf(components: readonly A2uiReportComponent[]): ReportSurface {
  const processor = new MessageProcessor<ReactComponentImplementation>([REPORT_CATALOG])
  try {
    processor.processMessages([
      { version: "v0.9", createSurface: { surfaceId: SURFACE_ID, catalogId: REPORT_CATALOG.id } },
      { version: "v0.9", updateComponents: { surfaceId: SURFACE_ID, components: [...components] } },
    ])
  } catch {
    return { kind: "failed" }
  }
  const surface = processor.model.surfacesMap.get(SURFACE_ID)
  return surface === undefined ? { kind: "failed" } : { kind: "surface", processor, surface }
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

function useReport(): ReportContextValue {
  const value = use(ReportContext)
  if (value === undefined) {
    throw new Error("A2UI の面の部品が A2uiReport の外で描かれた")
  }
  return value
}

/**
 * 根の `Report` の実装。既定の描画と同じ根と欄の並びを描く。
 * 頭の順に、図・本文の節・振り返り・お願いを並べる。
 * 本文の節は部品の木から、図と振り返りは面の値の塊の並び（`figure`・`retrospective`）から描く。
 * 頭の結論と数の札・お願いは値から直接描き、頭の残り（合図の行など）は Markdown で描く。
 */
function ReportRoot(): ReactElement {
  const report = useReport()
  const { body, view } = report
  const bodySections = Object.entries(view.sections).toSorted(
    ([, left], [, right]) => left.regionId - right.regionId,
  )
  return (
    <ReportFrame reveal={report.reveal} turnId={report.turnId} className={report.className}>
      <HeadRegion head={view.head} />
      {view.figure.kind === "leaves" && (
        <RegionBox region={{ kind: "section", id: view.figure.regionId }}>
          <LeafRegionContent region={view.figure} />
        </RegionBox>
      )}
      {bodySections.map(([componentId, section]) => (
        <RegionBox key={section.regionId} region={{ kind: "section", id: section.regionId }}>
          <SectionContent id={componentId} />
        </RegionBox>
      ))}
      {view.retrospective.kind === "leaves" && (
        <RegionBox region={{ kind: "retrospective" }}>
          <LeafRegionContent region={view.retrospective} />
        </RegionBox>
      )}
      <FavorRegion id={body.favor.id} markdown={body.favor.markdown} />
    </ReportFrame>
  )
}

/** 図か振り返りの欄の中身。見出しは節と同じ手で描き、塊は並びの順に、葉は面の葉の実装、葉に由来しない塊は Markdown で描く。 */
function LeafRegionContent(props: {
  readonly region: Extract<MainViewSurfaceLeafRegion, { readonly kind: "leaves" }>
}): ReactElement {
  const { heading, headingText, entries } = props.region
  const drawnDirectly = heading !== "" && isPlainHeadingText(headingText)
  return (
    <>
      {drawnDirectly && <h4>{headingText}</h4>}
      {!drawnDirectly && heading !== "" && <RegionChunks markdown={heading} />}
      {entries.map((entry) =>
        entry.kind === "leaf" ? (
          <PartBody key={`leaf-${entry.id}`} id={entry.id} />
        ) : (
          <RegionChunks key={`text-${entry.markdown}`} markdown={entry.markdown} />
        ),
      )}
    </>
  )
}

/** 根の子1つが写った節の中身。`Section` なら見出しと子、それ以外はその部品を見出し無しで描く。 */
function SectionContent(props: { readonly id: string }): ReactElement {
  const report = useReport()
  const part = report.parts.get(props.id)
  const section = report.view.sections[props.id]
  const headingLine = section?.heading ?? ""
  const headingText = report.body.sections.find((s) => s.id === section?.regionId)?.heading ?? ""
  const drawnDirectly = headingLine !== "" && isPlainHeadingText(headingText)
  return (
    <>
      {drawnDirectly && <h4>{headingText}</h4>}
      <PartRun
        lead={drawnDirectly ? "" : headingLine}
        ids={part?.component === "Section" ? part.children : [props.id]}
      />
    </>
  )
}

/**
 * ID の並びを描く。`lead`（見出しの行）は欄の描画と同じ手で先頭に描く。
 * 入れ子の `Section` は中の子を同じ並びに開く。
 */
function PartRun(props: { readonly lead: string; readonly ids: readonly string[] }): ReactElement {
  const report = useReport()
  return (
    <>
      {props.lead !== "" && <RegionChunks markdown={props.lead} />}
      {runIds(props.ids, report).map((id) => (
        <PartBody key={id} id={id} />
      ))}
    </>
  )
}

function runIds(ids: readonly string[], report: ReportContextValue): readonly string[] {
  return ids.flatMap((id): readonly string[] => {
    const part = report.parts.get(id)
    if (part === undefined) {
      return []
    }
    return part.component === "Section" ? runIds(part.children, report) : [id]
  })
}

/** 並べ替えか絞り込みを受ける `Table`。使わない `Table` は欄の Markdown のまま描く。 */
function isInteractiveTable(part: A2uiReportComponent): part is A2uiReportPart<"Table"> {
  return part.component === "Table" && (part.sortable === true || part.filterable === true)
}

function PartView(props: { readonly id: string }): ReactElement {
  const report = useReport()
  const part = report.parts.get(props.id)
  if (part === undefined || part.id === A2UI_ROOT_ID) {
    return <></>
  }
  if (part.component === "Section") {
    return <SectionContent id={props.id} />
  }
  return <PartBody id={props.id} />
}

/** `Markdown` の葉は書き手の Markdown を欄と同じ描画に通し、ほかの部品は配置の部品か直接描く葉として描く。 */
function PartBody(props: { readonly id: string }): ReactElement {
  const report = useReport()
  return report.parts.get(props.id)?.component === "Markdown" ? (
    <RegionChunks markdown={report.view.markdownLeaves[props.id] ?? ""} />
  ) : (
    <LayoutPart id={props.id} />
  )
}

/**
 * 配置の部品。`Row` は旧い `row` と、`Card` は旧い `panel` と同じ class を使い、`Column` は子を順に積む。
 * `Tabs` は題の並びと選んだ子1つ。`Divider` は `ui/` の罫。操作できる `Table` と `ChoicePicker` は別のファイルの `InteractiveTable`・`ChoicePicker`。
 */
function LayoutPart(props: { readonly id: string }): ReactElement {
  const report = useReport()
  const part = report.parts.get(props.id)
  switch (part?.component) {
    case "Row":
      return (
        <div className={arrangedBlockClassNames.row}>
          {part.children.map((child) => (
            <div key={child} className={arrangedBlockClassNames.rowCell}>
              <PartRun lead="" ids={[child]} />
            </div>
          ))}
        </div>
      )
    case "Column":
      return (
        <div>
          <PartRun lead="" ids={part.children} />
        </div>
      )
    case "Card":
      return (
        <div className={arrangedBlockClassNames.panel}>
          <PartRun lead="" ids={[part.child]} />
        </div>
      )
    case "Tabs":
      return <TabsPart tabs={part.tabs} />
    case "Divider":
      return (
        <Divider
          tone="soft"
          orientation={part.axis === "vertical" ? "vertical" : "horizontal"}
          className=""
        />
      )
    case "ChoicePicker":
      return <ChoicePicker dataModel={report.dataModel} part={part} />
    default: {
      if (part !== undefined && isInteractiveTable(part)) {
        return (
          <InteractiveTable
            dataModel={report.dataModel}
            part={part}
            value={report.view.leafValues[part.id]}
          />
        )
      }
      const view = part === undefined ? undefined : directLeafViewOf(part)
      return part === undefined || view === undefined ? (
        <></>
      ) : (
        <DirectLeaf
          part={part}
          value={report.view.leafValues[part.id]}
          imageSource={report.view.imageSource}
          view={view}
        />
      )
    }
  }
}

function TabsPart(props: {
  readonly tabs: Extract<A2uiReportComponent, { readonly component: "Tabs" }>["tabs"]
}): ReactElement {
  const [selected, setSelected] = useState(0)
  const current = props.tabs[selected] ?? props.tabs[0]
  return (
    <div>
      <div role="tablist">
        {props.tabs.map((tab, index) => (
          <Button
            key={tab.child}
            variant="ghost"
            size="action"
            pressed={index === selected ? "on" : "off"}
            disabled={false}
            disclosure={{ kind: "none" }}
            className=""
            onClick={() => {
              setSelected(index)
            }}
          >
            {typeof tab.title === "string" ? tab.title : ""}
          </Button>
        ))}
      </div>
      {current !== undefined && <PartRun lead="" ids={[current.child]} />}
    </div>
  )
}
