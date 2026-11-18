// 部品の一覧（`a2ui` の版）のレポート本文を、`@a2ui/react` の面とカタログの React 実装で描く。
//
// 自作の部品の子（`Report.children`・`Section.children`）は、カタログ文書が部品の参照として印を付けていないので `buildChild` で解けない。
// `buildChild` を使わず、根の `Report` の実装が一覧をたどって節・内容部品・配置の部品を描く。
// 部品ごとに挟まる `display: contents` の入れ物（`a2ui-react-<部品名>`）を根の1枚だけにし、欄と塊の入れ子を既定の描画と同じにする。
// 面の最初の描画は読み込み中の札なので、演出の根は `Report` の実装の中に置く（マウントした時点で本文が揃う）。

import {
  A2uiSurface,
  createComponentImplementation,
  type ReactComponentImplementation,
} from "@a2ui/react/v0_9"
import { Catalog, MessageProcessor } from "@a2ui/web_core/v0_9"
import { type ReactElement, useRef, useState } from "react"

import type { A2uiReportComponent } from "../../../shared/report/a2ui-report-catalog.ts"
import {
  A2UI_ROOT_ID,
  type A2uiReportPart,
  a2uiPartsById,
} from "../../../shared/report/a2ui-report-outline.ts"
import type { MainViewSurfaceLeafRegion } from "../../../shared/session/main-view-shape.ts"
import { Button } from "../../components/ui/button/button.tsx"
import { Divider } from "../../components/ui/divider/divider.tsx"
import { FirstNoteList } from "../../components/ui/first-note-list/first-note-list.tsx"
import { useExternalSync } from "../../hooks/use-external-sync.ts"
import { useFirstNoteList } from "../../stores/first-note-seen.ts"
import {
  ReportContext,
  runSlots,
  sectionHeadingOf,
  sectionSlots,
  useReport,
} from "./a2ui-report-context.ts"
import { FailedReport } from "./a2ui-surface-failed.tsx"
import {
  type A2uiReportProps,
  addMissingComponents,
  renderOrderIdsOf,
  type ReportSurface,
  SURFACE_ID,
} from "./a2ui-surface-model.ts"
import { loadReportCatalogApis } from "./domain/a2ui-catalog-load.ts"
import { filterBadges, hasBoundChoicePicker, isSortableTable } from "./domain/a2ui-table-view.ts"
import { beforeAfterPairIdsInOrder, type PairView, pairSwitchLabels } from "./domain/pair-view.ts"
import { isPlainHeadingText } from "./domain/plain-heading.ts"
import { reportProofView } from "./domain/report-proof.ts"
import { useGridColumnCount } from "./hooks/use-grid-column-count.ts"
import { ChoicePicker, InteractiveTable } from "./leaf/a2ui-interactive-view.tsx"
import { RegionBox, RegionChunks, ReportFrame } from "./leaf/body-region.tsx"
import { ChartTermLinkScope, chartLinkInputsOf } from "./leaf/chart-term-link.tsx"
import { DirectLeaf, directLeafViewOf } from "./leaf/direct-leaf-view.tsx"
import { FavorFollowUp } from "./leaf/favor-follow-up.tsx"
import { PairViewContext } from "./leaf/pair-view-context.ts"
import { liveLeafElement, useReevaluatedLeaves } from "./leaf/parameter-knob.tsx"
import { PendingHeading, PendingPart } from "./leaf/pending-part.tsx"
import { SectionProof } from "./leaf/proof-band.tsx"
import { HeadRegion, NotDoneRegion } from "./leaf/report-head-region.tsx"
import { arrangedBlockClassNames } from "./markdown.tsx"

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
  const [pairView, setPairView] = useState<PairView>("side")
  const pairIds = beforeAfterPairIdsInOrder(renderOrderIdsOf(props.view), parts)
  if (surface.kind === "failed") {
    return <FailedReport {...props} error={surface.error} />
  }
  return (
    <ReportContext value={{ ...props, parts, dataModel: surface.surface.dataModel, leaves }}>
      <PairViewContext
        value={{
          view: pairView,
          setView: setPairView,
          ...(pairIds[0] === undefined ? {} : { ownerId: pairIds[0] }),
          labels: pairSwitchLabels(parts),
        }}
      >
        <A2uiSurface surface={surface.surface} />
      </PairViewContext>
    </ReportContext>
  )
}

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

/** 一覧から面を作る。拒まれたら `failed`。 */
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

/**
 * 根の `Report` の実装。既定の描画と同じ根と欄の並びを描く。
 * 頭の順に、図・本文の節・振り返り・お願いを並べる。
 * 本文の節は部品の木から、図と振り返りは面の値の塊の並び（`figure`・`retrospective`）から描く。
 * 頭とお願いは面の値から直接描き、欄の Markdown を読まない。
 */
function ReportRoot(): ReactElement {
  const report = useReport()
  const { view } = report
  const slots = sectionSlots(report)
  const proof = reportProofView(
    view.head.checks,
    slots.flatMap((slot) => (slot.kind === "drawn" ? [slot.componentId] : [])),
  )
  const firstNotes = useFirstNoteList(
    view.head.checks.kind === "checks" ? (["report-terms"] as const) : [],
  )
  return (
    <>
      <ReportFrame
        reveal={report.reveal}
        turnId={report.turnId}
        className={report.className}
        revealClassName={report.revealClassName}
        blockClassName={report.blockClassName}
      >
        <HeadRegion head={view.head} proof={proof} />
        {view.figure.kind === "leaves" && (
          <RegionBox region={{ kind: "section", id: view.figure.regionId }}>
            <LeafRegionContent region={view.figure} />
          </RegionBox>
        )}
        {/* `key` は根の子の ID。骨組みの欄が内容部品の届いた欄に替わっても、欄と見出しを作り直さない。 */}
        {slots.map((slot) => (
          <RegionBox
            key={slot.componentId}
            region={
              slot.kind === "pending" ? { kind: "pending" } : { kind: "section", id: slot.regionId }
            }
          >
            <SectionContent id={slot.componentId} />
            {proof.kind === "band" &&
              proof.sections
                .filter((entry) => entry.sectionId === slot.componentId)
                .map((entry) => <SectionProof key={entry.sectionId} section={entry} />)}
          </RegionBox>
        ))}
        <NotDoneRegion notDone={view.head.notDone} />
        {view.retrospective.kind === "leaves" && (
          <RegionBox region={{ kind: "retrospective" }}>
            <LeafRegionContent region={view.retrospective} />
          </RegionBox>
        )}
        <FavorFollowUp
          favor={view.favor}
          components={view.components}
          checks={view.head.checks}
          favorRef={report.favorRef}
          nextSteps={report.nextSteps}
        />
        <FirstNoteList {...firstNotes} />
      </ReportFrame>
    </>
  )
}

/** 図か振り返りの欄の中身。見出しは節と同じ手で描き、塊は並びの順に、内容部品は面の内容部品の実装、内容部品に由来しない塊は Markdown で描く。 */
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

/**
 * 根の子1つが写った節の中身。`Section` なら見出しと子、それ以外はその部品を見出し無しで描く。
 * 草稿でまだ届いていない根の子（次に届く見込みのもの）は、見出しの骨組みを置く（中身の骨組みは `PartRun` が置く）。
 */
function SectionContent(props: { readonly id: string }): ReactElement {
  const report = useReport()
  const part = report.parts.get(props.id)
  const heading = sectionHeadingOf(report, props.id)
  const drawnDirectly = heading.line !== "" && isPlainHeadingText(heading.text)
  const ids = part?.component === "Section" ? part.children : [props.id]
  return (
    <>
      {part === undefined && <PendingHeading blink={report.pending?.blink === true} />}
      {drawnDirectly && <h4>{heading.text}</h4>}
      <ChartTermLinkScope charts={chartLinkInputsOf(ids, report.parts, report.leaves)}>
        <PartRun lead={drawnDirectly ? "" : heading.line} ids={ids} />
      </ChartTermLinkScope>
    </>
  )
}

/**
 * ID の並びを描く。`lead`（見出しの行）は欄の描画と同じ手で先頭に描く。
 * 入れ子の `Section` は中の子を同じ並びに開く。草稿で次に届く見込みの部品の場所には骨組みを置く。
 */
function PartRun(props: { readonly lead: string; readonly ids: readonly string[] }): ReactElement {
  const report = useReport()
  return (
    <>
      {props.lead !== "" && <RegionChunks markdown={props.lead} />}
      {runSlots(props.ids, report).map((slot) =>
        slot.kind === "part" ? (
          <PartBody key={`part:${slot.id}`} id={slot.id} />
        ) : (
          <PendingPart key="pending" blink={report.pending?.blink === true} />
        ),
      )}
    </>
  )
}

/** 並べ替えか絞り込みを受ける `Table`。使わない `Table` は欄の Markdown のまま描く。 */
function isInteractiveTable(part: A2uiReportComponent): part is A2uiReportPart<"Table"> {
  return part.component === "Table" && (isSortableTable(part) || part.filterable === true)
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

/** `Markdown` の内容部品は書き手の Markdown を欄と同じ描画に通し、ほかの部品は配置の部品か直接描く内容部品として描く。 */
function PartBody(props: { readonly id: string }): ReactElement {
  const report = useReport()
  return report.parts.get(props.id)?.component === "Markdown" ? (
    <RegionChunks markdown={report.view.markdownLeaves[props.id] ?? ""} />
  ) : (
    <LayoutPart id={props.id} />
  )
}

/**
 * 配置の部品。`Row` は旧い `row` と、`Card` は旧い `panel` と同じ class を使い、`Column` は子を順に積み、`Grid` は器の幅で段に折り返す。
 * `Tabs` は題の並びと選んだ子1つ。`Divider` は `ui/` の罫。操作できる `Table` と `ChoicePicker` は別のファイルの `InteractiveTable`・`ChoicePicker`。
 */
function LayoutPart(props: { readonly id: string }): ReactElement {
  const report = useReport()
  const part = report.parts.get(props.id)
  const live = liveLeafElement(report, props.id)
  if (live !== undefined) {
    return live
  }
  switch (part?.component) {
    case "Row":
      return (
        <div className={arrangedBlockClassNames.row} data-part-row="">
          {part.children.map((child) => (
            <RowCell key={child} id={child} />
          ))}
        </div>
      )
    case "Column":
      return (
        <div>
          <PartRun lead="" ids={part.children} />
        </div>
      )
    case "Grid":
      return <GridPart ids={part.children} />
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
            badges={hasBoundChoicePicker(report.parts.values(), part.id) ? [] : filterBadges(part)}
          />
        )
      }
      const view = part === undefined ? undefined : directLeafViewOf(part)
      return part === undefined || view === undefined ? (
        <></>
      ) : (
        <DirectLeaf
          part={report.leaves[part.id]?.component ?? part}
          value={report.view.leafValues[part.id]}
          imageSource={report.view.imageSource}
          view={view}
        />
      )
    }
  }
}

/** 器の幅で段に折り返す格子。セルは `Row` のセルと同じく器にする。 */
function GridPart(props: { readonly ids: readonly string[] }): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null)
  const columns = useGridColumnCount(gridRef, props.ids.length)
  return (
    <div
      ref={gridRef}
      className={arrangedBlockClassNames.grid}
      data-part-grid=""
      style={{ "--report-grid-columns": columns }}
    >
      {props.ids.map((child) => (
        <RowCell key={child} id={child} />
      ))}
    </div>
  )
}

/** `Row` と `Grid` の子1つ。 */
function RowCell(props: { readonly id: string }): ReactElement {
  return (
    <div className={arrangedBlockClassNames.rowCell}>
      <PartRun lead="" ids={[props.id]} />
    </div>
  )
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
