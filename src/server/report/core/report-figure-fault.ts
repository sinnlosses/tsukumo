// 図の塊（`mermaid`・`svg`・`graph`）の不具合の検出。
// 位置と字句の名前だけを持ち、書き手のソースの文字は持たない。

import { readGraphSource } from "../../../shared/report/graph-source.ts"
import {
  REPORT_MERMAID_KINDS,
  type ReportGraph,
} from "../../../shared/report/report-block-diagram.ts"
import type { ReportBlock, ReportSection } from "../../../shared/report/report-block.ts"

/**
 * 構文が割れた `mermaid` の塊の位置。`block` は `mermaid` の塊の通し番号（1始まり）。
 * `located` は構文エラーの行が取れたもの。`line` は図の中の行、`token` は mermaid の字句の名前（無いときは空）。
 * `unlocated` は行が取れないもの（未知の図種など）。どちらも書き手のソースの文字は持たない。
 */
export type MermaidFault =
  | {
      readonly kind: "located"
      readonly block: number
      readonly line: number
      readonly token: string
    }
  | { readonly kind: "unlocated"; readonly block: number }

const MERMAID_KINDS: ReadonlySet<string> = new Set(REPORT_MERMAID_KINDS)

/**
 * `MermaidFault.block` はこの並びの通し番号。
 * 塊の出現順に並び、`beforeAfter` は前の側が先。並びを変えると位置がずれる。
 */
export function mermaidSourcesInSections(sections: readonly ReportSection[]): readonly string[] {
  return sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => {
      switch (block.kind) {
        case "mermaid":
          return [block.source]
        case "beforeAfter":
          return [block.before, block.after].flatMap((side) =>
            side.kind === "mermaid" ? [side.source] : [],
          )
        default:
          return []
      }
    })
}

export function unknownMermaidCount(sections: readonly ReportSection[]): number {
  return mermaidSourcesInSections(sections).filter(
    (source) => !MERMAID_KINDS.has(mermaidKind(source)),
  ).length
}

/** 割れた図の位置（何個目の何行目・字句の名前）の並び。書き手のソースの文字は入れない。 */
export function mermaidFaultPositions(faults: readonly MermaidFault[]): string {
  return faults
    .map((fault) =>
      fault.kind === "unlocated"
        ? `${String(fault.block)}個目`
        : `${String(fault.block)}個目の ${String(fault.line)} 行目${fault.token === "" ? "" : `・字句 ${fault.token}`}`,
    )
    .join("、")
}

/** `block` は `svg` の塊（`beforeAfter` の側を含む）の出現順の1始まり、`shape` は `shapes` の中の1始まり。 */
export type SvgFault = { readonly block: number; readonly shape: number }

/** `block` は `svg`（`graph`）の塊の出現順の1始まり、`tone` は凡例に無い色の目印。 */
export type ToneFault = { readonly block: number; readonly tone: string }

type SvgFigure = Pick<
  Extract<ReportBlock, { readonly kind: "svg" }>,
  "width" | "height" | "shapes" | "legend"
>

export function svgFaultsInSections(sections: readonly ReportSection[]): readonly SvgFault[] {
  return svgFiguresInSections(sections).flatMap((figure, figureIndex) =>
    figure.shapes.flatMap((shape, shapeIndex) =>
      isInsideSvg(shape, figure) ? [] : [{ block: figureIndex + 1, shape: shapeIndex + 1 }],
    ),
  )
}

export function svgToneFaultsInSections(sections: readonly ReportSection[]): readonly ToneFault[] {
  return svgFiguresInSections(sections).flatMap((figure, figureIndex) => {
    const legended = new Set(figure.legend.map((entry) => entry.tone))
    const used = figure.shapes.flatMap((shape) =>
      (shape.kind === "rect" || shape.kind === "line") && shape.tone !== "none" ? [shape.tone] : [],
    )
    return [...new Set(used)]
      .filter((tone) => !legended.has(tone))
      .map((tone) => ({ block: figureIndex + 1, tone }))
  })
}

/** 凡例に無い `tone` の位置（何個目の塊のどの `tone` か）の並び。 */
export function toneFaultPositions(faults: readonly ToneFault[]): string {
  return faults.map((fault) => `${String(fault.block)}個目の ${fault.tone}`).join("、")
}

/** はみ出した図形の位置（何個目の塊の何番目の図形か）の並び。 */
export function svgFaultPositions(faults: readonly SvgFault[]): string {
  return faults
    .map((fault) => `${String(fault.block)}個目の ${String(fault.shape)} 番目`)
    .join("、")
}

/** `block` は `graph` の塊の出現順の1始まり、`line` は `source` の1始まりの行。 */
export type GraphFault = { readonly block: number; readonly line: number }

export function graphFaultsInSections(sections: readonly ReportSection[]): readonly GraphFault[] {
  return sections
    .flatMap((section) => section.blocks)
    .flatMap((block): readonly ReportGraph[] => (block.kind === "graph" ? [block] : []))
    .flatMap((graph, graphIndex) =>
      readGraphSource(graph.source).brokenLines.map((line) => ({ block: graphIndex + 1, line })),
    )
}

export function graphFaultPositions(faults: readonly GraphFault[]): string {
  return faults.map((fault) => `${String(fault.block)}個目の ${String(fault.line)} 行目`).join("、")
}

export function graphToneFaultsInSections(
  sections: readonly ReportSection[],
): readonly ToneFault[] {
  return sections
    .flatMap((section) => section.blocks)
    .flatMap((block): readonly ReportGraph[] => (block.kind === "graph" ? [block] : []))
    .flatMap((graph, graphIndex) => {
      const { nodes, edges, groups } = readGraphSource(graph.source)
      const legended = new Set(graph.legend.map((entry) => entry.tone))
      const used = [...nodes, ...edges, ...groups].map(({ tone }) => tone)
      return [...new Set(used)]
        .filter((tone) => tone !== "none" && !legended.has(tone))
        .map((tone) => ({ block: graphIndex + 1, tone }))
    })
}

function svgFiguresInSections(sections: readonly ReportSection[]): readonly SvgFigure[] {
  return sections
    .flatMap((section) => section.blocks)
    .flatMap((block): readonly SvgFigure[] => {
      switch (block.kind) {
        case "svg":
          return [block]
        case "beforeAfter":
          return [block.before, block.after].flatMap((side) => (side.kind === "svg" ? [side] : []))
        default:
          return []
      }
    })
}

function isInsideSvg(shape: SvgFigure["shapes"][number], { width, height }: SvgFigure): boolean {
  const inside = (x: number, y: number): boolean => x >= 0 && x <= width && y >= 0 && y <= height
  switch (shape.kind) {
    case "rect":
      return inside(shape.x, shape.y) && inside(shape.x + shape.width, shape.y + shape.height)
    case "line":
      return inside(shape.x1, shape.y1) && inside(shape.x2, shape.y2)
    case "text":
      return inside(shape.x, shape.y)
  }
}

/**
 * mermaid の図の種類（ソースの最初の語）。空行・`%%` の行（コメントと init の指定）と、先頭の `---` で囲んだ設定は飛ばす。
 * 中身が空なら空文字（規約の種類に無いので違反になる）。
 */
function mermaidKind(source: string): string {
  const lines = source.split("\n").map((line) => line.trim())
  const afterFrontmatter =
    lines.find((line) => line !== "") === "---"
      ? lines.slice(lines.indexOf("---", lines.indexOf("---") + 1) + 1)
      : lines
  const first = afterFrontmatter.find((line) => line !== "" && !line.startsWith("%%"))
  return first?.split(/\s/)[0] ?? ""
}
