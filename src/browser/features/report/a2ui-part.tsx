// 部品の一覧（`a2ui` の版）のレポート本文の根と部品を、面の値と一覧から描く。
//
// 自作の部品の子（`Report.children`・`Section.children`）は、カタログ文書が部品の参照として印を付けていないので `buildChild` で解けない。
// `buildChild` を使わず、根の `Report` の実装が一覧をたどって節・内容部品・配置の部品を描く。

import type { ReactComponentImplementation } from "@a2ui/react/v0_9"
import type { SurfaceModel } from "@a2ui/web_core/v0_9"
import { createContext, type ReactElement, use, useState } from "react"

import type { A2uiReportComponent } from "../../../shared/report/a2ui-report-catalog.ts"
import { A2UI_ROOT_ID, type A2uiReportPart } from "../../../shared/report/a2ui-report-outline.ts"
import type {
  MainViewA2uiReport,
  MainViewReportRegions,
  MainViewSurfaceLeafRegion,
} from "../../../shared/session/main-view-shape.ts"
import { Button } from "../../components/ui/button/button.tsx"
import { Divider } from "../../components/ui/divider/divider.tsx"
import { useReadingDepth } from "../../stores/reading-depth.ts"
import {
  notesOf,
  type ReplyNote,
  useReplyNotes,
  useReplySessionKey,
} from "../../stores/reply-note-list.ts"
import { AskThreadContext, type AskThreadSlot, sectionAskCount } from "./ask-thread-context.ts"
import { filterBadges, hasBoundChoicePicker, isSortableTable } from "./domain/a2ui-table-view.ts"
import { isPlainHeadingText } from "./domain/plain-heading.ts"
import {
  LeafIdentityContext,
  type SectionPoint,
  SectionPointContext,
} from "./leaf-point-context.ts"
import { ChoicePicker, InteractiveTable } from "./leaf/a2ui-interactive-view.tsx"
import { RegionBox, RegionChunks, ReportFrame } from "./leaf/body-region.tsx"
import { ChartTermLinkScope, chartLinkInputsOf } from "./leaf/chart-term-link.tsx"
import { DirectLeaf, directLeafViewOf } from "./leaf/direct-leaf-view.tsx"
import { NextStepRow, type NextStepsOrigin } from "./leaf/next-step-row.tsx"
import { liveLeafElement, type useReevaluatedLeaves } from "./leaf/parameter-knob.tsx"
import { FavorRegion, HeadRegion } from "./leaf/report-head-region.tsx"
import { SectionFoldButton } from "./leaf/section-fold-button.tsx"
import { arrangedBlockClassNames } from "./markdown.tsx"
import { ReplyPortContext, type ReplyPortSlot } from "./reply-port.ts"

type SurfaceView = Extract<MainViewA2uiReport, { readonly kind: "surface" }>

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
  readonly reportToolUseId?: string
}

type ReportContextValue = A2uiReportProps & {
  readonly parts: ReadonlyMap<string, A2uiReportComponent>
  readonly dataModel: SurfaceModel<ReactComponentImplementation>["dataModel"]
  readonly leaves: ReturnType<typeof useReevaluatedLeaves>
}

export const ReportContext = createContext<ReportContextValue | undefined>(undefined)

/**
 * 根の `Report` の実装。既定の描画と同じ根と欄の並びを描く。
 * 頭の順に、図・本文の節・振り返り・お願いを並べる。
 * 本文の節は部品の木から、図と振り返りは面の値の塊の並び（`figure`・`retrospective`）から描く。
 * 頭とお願いは面の値から直接描き、欄の Markdown を読まない。
 */
export function ReportRoot(): ReactElement {
  const report = useReport()
  const { view } = report
  return (
    <ReportFrame
      reveal={report.reveal}
      turnId={report.turnId}
      className={report.className}
      revealClassName={report.revealClassName}
      blockClassName={report.blockClassName}
    >
      <HeadRegion head={view.head} />
      <BodyRegions foldable={false} />
      <FavorRegion id={view.favor.id} text={view.favor.text} />
      {report.nextSteps !== undefined && (
        <NextStepRow origin={report.nextSteps} components={view.components} />
      )}
    </ReportFrame>
  )
}

/** 図・本文の節・振り返りの欄を、この順に並べる。`foldable` なら見出しのある本文の節ごとに畳みのボタンを先頭に置く。 */
export function BodyRegions(props: { readonly foldable: boolean }): ReactElement {
  const report = useReport()
  const { view } = report
  const foldedSections = useReadingDepth((state) => state.foldedSections)
  const askThreads = use(AskThreadContext)
  const replyPort = use(ReplyPortContext)
  const sessionKey = useReplySessionKey()
  const notes = notesOf(
    useReplyNotes((state) => state.notesBySession),
    sessionKey,
  )
  const bodySections = Object.entries(view.sections).toSorted(
    ([, left], [, right]) => left.regionId - right.regionId,
  )
  return (
    <>
      {view.figure.kind === "leaves" && (
        <RegionBox
          region={{ kind: "section", id: view.figure.regionId, askCount: 0, noteCount: 0 }}
        >
          <LeafRegionContent region={view.figure} />
        </RegionBox>
      )}
      {bodySections.map(([componentId, section]) => {
        const foldKey = `${String(report.turnId)}:${String(section.regionId)}`
        // 畳んだ節は見出しだけを残すので、見出しの無い節には畳みを付けない。
        const foldable = props.foldable && section.heading !== ""
        return (
          <RegionBox
            key={section.regionId}
            region={{
              kind: "section",
              id: section.regionId,
              askCount: askCountOf(report, askThreads, componentId),
              noteCount: noteCountOf(report, replyPort, notes, componentId),
              ...(foldable && {
                fold: { key: foldKey, folded: foldedSections.has(foldKey) },
              }),
            }}
          >
            {foldable && (
              <SectionFoldButton foldKey={foldKey} folded={foldedSections.has(foldKey)} />
            )}
            <SectionContent id={componentId} />
          </RegionBox>
        )
      })}
      {view.retrospective.kind === "leaves" && (
        <RegionBox region={{ kind: "retrospective" }}>
          <LeafRegionContent region={view.retrospective} />
        </RegionBox>
      )}
    </>
  )
}

export function PartView(props: { readonly id: string }): ReactElement {
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

export function useReport(): ReportContextValue {
  const value = use(ReportContext)
  if (value === undefined) {
    throw new Error("A2UI の面の部品が A2uiReport の外で描かれた")
  }
  return value
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

/** 根の子1つが写った節の中身。`Section` なら見出しと子、それ以外はその部品を見出し無しで描く。 */
function SectionContent(props: { readonly id: string }): ReactElement {
  const report = useReport()
  const part = report.parts.get(props.id)
  const section = report.view.sections[props.id]
  const headingLine = section?.heading ?? ""
  const headingText = report.body.sections.find((s) => s.id === section?.regionId)?.heading ?? ""
  const drawnDirectly = headingLine !== "" && isPlainHeadingText(headingText)
  const ids = part?.component === "Section" ? part.children : [props.id]
  const point: SectionPoint =
    report.reportToolUseId === undefined
      ? { kind: "none" }
      : { kind: "section", reportToolUseId: report.reportToolUseId, heading: headingText }
  return (
    <>
      {drawnDirectly && <h4>{headingText}</h4>}
      <SectionPointContext value={point}>
        <ChartTermLinkScope charts={chartLinkInputsOf(ids, report.parts, report.leaves)}>
          <PartRun lead={drawnDirectly ? "" : headingLine} ids={ids} />
        </ChartTermLinkScope>
      </SectionPointContext>
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

function askCountOf(report: ReportContextValue, threads: AskThreadSlot, sectionId: string): number {
  if (report.reportToolUseId === undefined) {
    return 0
  }
  const part = report.parts.get(sectionId)
  const ids = part?.component === "Section" ? part.children : [sectionId]
  return sectionAskCount(threads, report.reportToolUseId, runIds(ids, report))
}

/** 節の中の内容部品に付いた未送信の付箋の数。口が無い描画は付箋を読まない。 */
function noteCountOf(
  report: ReportContextValue,
  port: ReplyPortSlot,
  notes: readonly ReplyNote[],
  sectionId: string,
): number {
  if (port.kind === "none" || report.reportToolUseId === undefined) {
    return 0
  }
  const part = report.parts.get(sectionId)
  const ids = runIds(part?.component === "Section" ? part.children : [sectionId], report)
  return notes.filter(
    (note) =>
      note.state.kind === "unsent" &&
      note.target.key.reportToolUseId === report.reportToolUseId &&
      ids.includes(note.target.key.componentId),
  ).length
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
  return part.component === "Table" && (isSortableTable(part) || part.filterable === true)
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
 * 配置の部品。`Row` は旧い `row` と、`Card` は旧い `panel` と同じ class を使い、`Column` は子を順に積む。
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
          <LeafIdentityContext
            value={{ kind: "leaf", componentId: part.id, componentKind: part.component }}
          >
            <InteractiveTable
              dataModel={report.dataModel}
              part={part}
              value={report.view.leafValues[part.id]}
              badges={
                hasBoundChoicePicker(report.parts.values(), part.id) ? [] : filterBadges(part)
              }
            />
          </LeafIdentityContext>
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
