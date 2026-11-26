// 図を置かずに、図にできる材料を表・手順・長い文に逃がした回の検出と、材料ごとの直し方の文。
// 位置と材料の種類だけを持ち、本文の字は持たない。

import { sumBy, unique } from "remeda"

import { tableRowCells } from "../../../../../shared/report/report-block-comparison.ts"
import {
  MIN_FIGURE_PROSE_CHARS,
  MIN_FIGURE_STEPS,
  MIN_FIGURE_TABLE_ROWS,
} from "../../../../../shared/report/report-limit.ts"
import {
  type ReportOutline,
  type ReportOutlineLeaf,
  reportFigureOf,
} from "../../../../../shared/report/report-outline.ts"
import type { FigurePreference } from "../../../../../shared/session/session-default.ts"
import { drawsShape } from "../block/shape.ts"
import { type ReportDraft, textLengthOf } from "../draft.ts"

/**
 * 図にできる材料の種類。
 * `shape` は流れ・前後を描く部品、`number-table` は数の列がある表、`table` はそれ以外の表、
 * `steps` は番号つきの手順、`prose` は長い文。
 */
export type FigureMaterial = "shape" | "number-table" | "table" | "steps" | "prose"

/** 材料の位置（1 始まり）。`part` は `prose` のときセクション全体なので持たない。 */
export type FigureEscapeFault = {
  readonly material: FigureMaterial
  readonly section: number
  readonly part?: number
}

/** 図派の既定で図が無いのに、セクションに図にできる材料がある位置。図があるか文派なら空。 */
export function figureEscapeFaults(
  report: Pick<ReportDraft, "components" | "figurePreference">,
  outline: ReportOutline,
): readonly FigureEscapeFault[] {
  if (!requiresFigure(report.figurePreference)) {
    return []
  }
  if (reportFigureOf(report.components).kind !== "none") {
    return []
  }
  return outline.sections.flatMap((section, sectionIndex) => {
    const parts = section.leaves.flatMap((leaf, partIndex) =>
      leafMaterials(leaf).map((material) => ({
        material,
        section: sectionIndex + 1,
        part: partIndex + 1,
      })),
    )
    const prose =
      proseLength(section.leaves) >= MIN_FIGURE_PROSE_CHARS
        ? [{ material: "prose" as const, section: sectionIndex + 1 }]
        : []
    return [...parts, ...prose]
  })
}

/** 差し戻しの1行。どこに何の材料があるかと、材料ごとの直し方を並べる。 */
export function figureEscapeMessage(faults: readonly FigureEscapeFault[]): string {
  const positions = faults
    .map(
      (fault) =>
        `${String(fault.section)}個目のセクション${fault.part === undefined ? "" : `の${String(fault.part)}個目の部品`}が${MATERIAL_NAMES[fault.material]}`,
    )
    .join("・")
  const fixes = unique(faults.map((fault) => fault.material))
    .map((material) => MATERIAL_FIXES[material])
    .join("。")
  return (
    `利用者は図を主に読む設定なのに \`figure\` が無く、図にできる材料が本文に${String(faults.length)}個ある（${positions}）。` +
    `いちばん結論を支える材料を1つ選んで図にし、\`Report\` の \`figure\` にその部品の ID を書く。${fixes}。` +
    "図にした中身は表や文に重ねて書かない。`figureNone` を書いても、この材料が残るかぎり通らない"
  )
}

const MATERIAL_NAMES = {
  shape: "流れ・前後を描く部品",
  "number-table": `数の列がある${String(MIN_FIGURE_TABLE_ROWS)}行以上の \`Table\``,
  table: `${String(MIN_FIGURE_TABLE_ROWS)}行以上の \`Table\``,
  steps: `${String(MIN_FIGURE_STEPS)}項目以上の番号つきの \`ItemList\``,
  prose: `${String(MIN_FIGURE_PROSE_CHARS)}字以上の文`,
} as const satisfies Readonly<Record<FigureMaterial, string>>

/** 材料ごとの、図への直し方。差し戻し文には、当たった材料の行だけを載せる。 */
const MATERIAL_FIXES = {
  shape: "流れ・前後を描く部品は、その部品をそのまま `figure` へ移す（セクションには置かない）",
  "number-table":
    "数の列がある表は、その列を `Chart`（大きさは `bar`・前後は `arrow`・推移は `line`）か `Plot` にする。表に残すのは図に載らない列だけ",
  table:
    "表は、行が名前のつながり・行き先なら `Graph`、案×観点の可否なら `Matrix`、2 案の比較や前後なら `Compare` にする",
  steps: "番号つきの手順は、順と分岐を `Graph`（`A -> B`）にし、時刻があれば `Timeline` にする",
  prose:
    "長い文は、言っている中身の形（つながり・流れ・前後・比較・数）を決めてその図にし、文は図で言えない理由と注意だけに縮める",
} as const satisfies Readonly<Record<FigureMaterial, string>>

const NUMBER_CELL = /^[+-]?\d[\d,]*(?:\.\d+)?\s*[^\d\s]{0,3}$/

function requiresFigure(preference: FigurePreference): boolean {
  return preference === "chart"
}

/** 部品が図の材料なら、その種類1つの並び。材料でなければ空。 */
function leafMaterials(leaf: ReportOutlineLeaf): readonly FigureMaterial[] {
  if (drawsShape(leaf)) {
    return ["shape"]
  }
  if (leaf.component === "Table" && leaf.rows.length >= MIN_FIGURE_TABLE_ROWS) {
    return [hasNumberColumn(leaf) ? "number-table" : "table"]
  }
  if (
    leaf.component === "ItemList" &&
    leaf.style === "ordered" &&
    leaf.items.length >= MIN_FIGURE_STEPS
  ) {
    return ["steps"]
  }
  return []
}

/** 2列目より右に、どの行も数（単位は3字まで）の列があるか。1列目は名前とみなして見ない。 */
function hasNumberColumn(
  leaf: Extract<ReportOutlineLeaf, { readonly component: "Table" }>,
): boolean {
  const rows = leaf.rows.map(tableRowCells)
  return leaf.columns.some(
    (_, column) =>
      column > 0 &&
      rows.every((cells) => {
        const cell = cells[column]
        return typeof cell === "string" && NUMBER_CELL.test(cell.trim())
      }),
  )
}

function proseLength(leaves: readonly ReportOutlineLeaf[]): number {
  return sumBy(leaves, (leaf) =>
    leaf.component === "Paragraph"
      ? textLengthOf(leaf.text)
      : leaf.component === "Markdown"
        ? textLengthOf(leaf.markdown)
        : 0,
  )
}
