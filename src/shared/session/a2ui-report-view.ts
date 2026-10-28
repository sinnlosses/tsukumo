// `report` の記録が持つ部品の一覧（`a2ui` の版）を、A2UI の面で描くための値にする。
// 葉の Markdown は節の欄の Markdown と同じ組み方から塊ごとに取り、部品の ID に当てる。

import { zip } from "remeda"

import type { A2uiReportComponent } from "../report/a2ui-report-catalog.ts"
import {
  A2UI_ROOT_ID,
  type A2uiOutlineSection,
  a2uiOutlineSections,
  a2uiPartsById,
} from "../report/a2ui-report-outline.ts"
import type { RecordedReportFigure, ReportSection } from "../report/report-block.ts"
import { joinParts } from "../report/report-inline-markdown.ts"
import type { ReportSectionPieces } from "../report/report-markdown.ts"
import { type TagTones, tableRowMarkdowns } from "../report/report-table-markdown.ts"
import { type TidiedBlock, tidiedSectionBlocks } from "../report/report-tidy.ts"
import type { MainViewA2uiReport, MainViewTableRows } from "./main-view-shape.ts"

/** 部品の一覧で描く本文に要る、記録の欄。 */
export type A2uiReportSource = {
  readonly components: readonly A2uiReportComponent[]
  readonly conclusion: string
  readonly figure: RecordedReportFigure
  readonly sections: readonly ReportSection[]
}

/**
 * 部品の一覧を、節の欄の ID と葉ごとの Markdown に当てる。
 * `pieces` は描く節の並び（`figure` の図の節 → 整形した `sections` → 振り返り）の塊ごとの Markdown で、添字が欄の ID。
 * 根の子ごとの葉の数が記録の `sections` の塊の数と食い違えば `none`（一覧から写した節ではない）。
 * `tagTones` は `pieces` を組んだときの札の色の割り当てで、操作できる表の行を組み直すのに使う。
 */
export function a2uiReportView(
  report: A2uiReportSource,
  pieces: readonly ReportSectionPieces[],
  tagTones: TagTones,
): MainViewA2uiReport {
  const byId = a2uiPartsById(report.components)
  const root = byId.get(A2UI_ROOT_ID)
  if (root?.component !== "Report") {
    return { kind: "none" }
  }
  const outline = a2uiOutlineSections(root, byId)
  const matched =
    outline.length === report.sections.length &&
    zip(outline, report.sections).every(
      ([section, recorded]) => section.leafIds.length === recorded.blocks.length,
    )
  if (!matched) {
    return { kind: "none" }
  }
  const tidied = tidiedSectionBlocks({
    conclusion: report.conclusion,
    sections: report.sections,
  })
  const folded = zip(outline, tidied).reduce<ViewFold>(
    (acc, [section, blocks]) => {
      const kept = blocks.flatMap((block, index) => (block.kind === "kept" ? [index] : []))
      const piece = kept.length === 0 ? undefined : pieces[acc.regionId]
      const leaves = section.leafIds.map((leafId, index): readonly [string, string] => {
        const position = kept.indexOf(index)
        return [leafId, piece === undefined || position < 0 ? "" : (piece.blocks[position] ?? "")]
      })
      if (piece === undefined) {
        return { ...acc, leaves: [...acc.leaves, ...leaves] }
      }
      const drawn = joinParts([piece.heading, ...piece.blocks]) !== ""
      return {
        regionId: acc.regionId + 1,
        sections: drawn
          ? [
              ...acc.sections,
              [section.componentId, { regionId: acc.regionId, heading: piece.heading }],
            ]
          : acc.sections,
        leaves: [...acc.leaves, ...leaves],
      }
    },
    { regionId: report.figure.kind === "none" ? 0 : 1, sections: [], leaves: [] },
  )
  const leaves = Object.fromEntries(folded.leaves)
  const tables = interactiveTables(zip(outline, tidied), byId, leaves, tagTones)
  return tables === undefined
    ? { kind: "none" }
    : {
        kind: "surface",
        components: report.components,
        sections: Object.fromEntries(folded.sections),
        leaves,
        tables,
      }
}

/**
 * 操作できる `Table` の Markdown を、データ行の前後と行ごとに分ける。行は表を組む関数が出す行そのもので、葉の Markdown の中に連なって入っている。
 * 見つからない表が 1 つでもあれば undefined（行を選び直せない表のボタンを、押せるまま出さない）。
 */
function interactiveTables(
  sections: readonly (readonly [A2uiOutlineSection, readonly TidiedBlock[]])[],
  byId: ReadonlyMap<string, A2uiReportComponent>,
  leaves: Readonly<Record<string, string>>,
  tagTones: TagTones,
): Readonly<Record<string, MainViewTableRows>> | undefined {
  const found = sections.flatMap(([section, blocks]) =>
    section.leafIds.flatMap(
      (leafId, index): readonly (readonly [string, MainViewTableRows | undefined])[] => {
        const part = byId.get(leafId)
        const tidied = blocks[index]
        const markdown = leaves[leafId] ?? ""
        if (
          part?.component !== "Table" ||
          (part.sortable !== true && part.filterable !== true) ||
          markdown === "" ||
          tidied?.kind !== "kept" ||
          tidied.block.kind !== "table"
        ) {
          return []
        }
        return [[leafId, splitAtRows(markdown, tableRowMarkdowns(tidied.block, tagTones))]]
      },
    ),
  )
  return found.every(([, split]) => split !== undefined)
    ? Object.fromEntries(found.flatMap(([id, split]) => (split === undefined ? [] : [[id, split]])))
    : undefined
}

function splitAtRows(markdown: string, rows: readonly string[]): MainViewTableRows | undefined {
  const joined = rows.join("\n")
  const start = joined === "" ? -1 : markdown.indexOf(joined)
  return start < 0
    ? undefined
    : { before: markdown.slice(0, start), rows, after: markdown.slice(start + joined.length) }
}

type ViewFold = {
  readonly regionId: number
  readonly sections: readonly (readonly [
    string,
    { readonly regionId: number; readonly heading: string },
  ])[]
  readonly leaves: readonly (readonly [string, string])[]
}
