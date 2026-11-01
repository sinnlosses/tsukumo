// 図の検査の家族。違反の型・検出・差し戻し文を持つ。

import type { FigureHardRuleName } from "../../../../shared/report/figure-decision.ts"
import {
  drawnLeaves,
  type ReportOutline,
  timelinesOfLeaves,
} from "../../../../shared/report/report-outline.ts"
import type { ReportDraft } from "./draft.ts"
import {
  type GraphFault,
  graphFaultPositions,
  graphFaultsInLeaves,
  graphToneFaultsInLeaves,
  svgFaultPositions,
  type SvgFault,
  svgFaultsInLeaves,
  svgToneFaultsInLeaves,
  toneFaultPositions,
  type ToneFault,
  unknownMermaidCount,
} from "./figure/diagram.ts"
import {
  type FigureNumberFault,
  figureNumberFaultPositions,
  figureNumberFaults,
} from "./figure/number-fault.ts"
import { plotFormFaults } from "./figure/plot-form.ts"
import { plotNoteFaults } from "./figure/plot-note.ts"
import {
  type TimelineBlockFault,
  timelineFaultPositions,
  timelineFaults,
} from "./figure/timeline.ts"

export type FigureViolation =
  /** `mermaid` の塊に、規約が挙げる種類（`REPORT_MERMAID_KINDS`）の外の種類がある。 */
  | { readonly kind: "unknown-mermaid"; readonly count: number }
  /** `svg` の塊の図形が `width` × `height` の外に出る。`faults` は位置だけで、図形の中身は持たない。 */
  | {
      readonly kind: "broken-svg"
      readonly count: number
      readonly faults: readonly SvgFault[]
    }
  /** `svg` の塊の `rect` の `tone` が `legend` に無い。`faults` は位置と `tone` の名前だけ。 */
  | {
      readonly kind: "unlegended-svg-tone"
      readonly count: number
      readonly faults: readonly ToneFault[]
    }
  /** `graph` の塊の ` @a`〜` @e` の色の目印が `legend` に無い。`faults` は位置と `tone` の名前だけ。 */
  | {
      readonly kind: "unlegended-graph-tone"
      readonly count: number
      readonly faults: readonly ToneFault[]
    }
  /** `graph` の塊の `source` に読めない行がある。`faults` は位置だけで、書き手の行は持たない。 */
  | {
      readonly kind: "broken-graph"
      readonly count: number
      readonly faults: readonly GraphFault[]
    }
  /** `timeline` の塊の時刻が読めない・尺度が混ざる・昇順でない・終了が開始より前・`emphasis` が行に無い。`faults` は位置と理由だけで、行の名前と時刻の字は持たない。 */
  | {
      readonly kind: "broken-timeline"
      readonly count: number
      readonly faults: readonly TimelineBlockFault[]
    }
  /**
   * 本文（`conclusion`・`keyFigures`・節の `text`）の数が、どの `plot` の `Q` 列の値とも一致せず、ある列の値と取り違えた形（近い値・桁の単位違い）をしている。
   * `faults` は位置だけで、本文の字も列の名前も持たない。
   */
  | {
      readonly kind: "figure-number-mismatch"
      readonly count: number
      readonly faults: readonly FigureNumberFault[]
    }
  /**
   * `plot` の `form` が置いてはならない形（`FIGURE_HARD_RULES`）に当たり、決定表の形で描いた。
   * `rules` は当たった `plot` ごとの規則の名前。
   */
  | {
      readonly kind: "plot-forbidden-form"
      readonly count: number
      readonly rules: readonly FigureHardRuleName[]
    }
  /** `plot` の `form` が、どちらの図の既定で決めた形とも違い、上書きとして通した。 */
  | { readonly kind: "plot-form-override"; readonly count: number }
  /** 棒・折れ線・円で描く `plot` の題に数が無い。 */
  | { readonly kind: "plot-title-without-number"; readonly count: number }

/** 図の違反を、当てはまらないもの（`count` が 0）も含めて並べる。 */
export function detectFigureViolations(
  report: ReportDraft,
  outline: ReportOutline,
): readonly FigureViolation[] {
  const drawn = drawnLeaves(outline)
  const svgFaults = svgFaultsInLeaves(drawn)
  const svgToneFaults = svgToneFaultsInLeaves(drawn)
  const graphFaults = graphFaultsInLeaves(drawn)
  const graphToneFaults = graphToneFaultsInLeaves(drawn)
  const timelineFaultList = timelineFaults(timelinesOfLeaves(drawn))
  const figureNumberFaultList = figureNumberFaults(report, outline)
  const plotForms = plotFormFaults(outline)

  return [
    { kind: "unknown-mermaid", count: unknownMermaidCount(drawn) },
    { kind: "broken-svg", count: svgFaults.length, faults: svgFaults },
    { kind: "unlegended-svg-tone", count: svgToneFaults.length, faults: svgToneFaults },
    { kind: "unlegended-graph-tone", count: graphToneFaults.length, faults: graphToneFaults },
    { kind: "broken-graph", count: graphFaults.length, faults: graphFaults },
    { kind: "broken-timeline", count: timelineFaultList.length, faults: timelineFaultList },
    {
      kind: "figure-number-mismatch",
      count: figureNumberFaultList.length,
      faults: figureNumberFaultList,
    },
    { kind: "plot-forbidden-form", count: plotForms.refused.length, rules: plotForms.refused },
    { kind: "plot-form-override", count: plotForms.overrides },
    { kind: "plot-title-without-number", count: plotNoteFaults(outline) },
  ]
}

/** 図の違反を、差し戻すときの1行の文面にする。 */
export function figureViolationMessage(violation: FigureViolation): string {
  switch (violation.kind) {
    case "unknown-mermaid":
      return `\`Mermaid\` の図に規約の2種（sequenceDiagram・stateDiagram-v2）の外の種類が${violation.count}個ある。flowchart は \`Graph\` で書き、それ以外の図は \`Table\`・\`ItemList\`・\`Svg\` で書く`
    case "broken-svg":
      return `\`Svg\` の図形が \`width\` × \`height\` の外に出ている（${svgFaultPositions(violation.faults)}）。幅の目安は 480〜640 で、図形の座標と大きさを 0〜\`width\`・0〜\`height\` の内側に収める`
    case "unlegended-svg-tone":
      return `\`Svg\` の \`rect\` の \`tone\` が \`legend\` に無い（${toneFaultPositions(violation.faults)}）。\`legend\` に \`tone\` と名前を足す（色だけで意味を言わない）`
    case "unlegended-graph-tone":
      return `\`Graph\` の \` @a\`〜\` @e\` の色の目印が \`legend\` に無い（${toneFaultPositions(violation.faults)}）。\`legend\` に \`tone\` と名前を足す（色だけで意味を言わない）`
    case "broken-graph":
      return `\`Graph\` の \`source\` に読めない行がある（${graphFaultPositions(violation.faults)}）。1行を \`A -> B: 語\` の形に直す（\`: 語\` は省ける）。囲みは \`[群の名]\` 〜 \`[]\` で、内側を先に \`[]\` で閉じる入れ子は2階層まで（3階層以上と閉じ忘れは読めない）。箱の説明は \`名前 | 一\\n二\` の \`\\n\` で区切って3行まで（空の行も不可）`
    case "broken-timeline":
      return `\`Timeline\` の時刻に誤りがある（${timelineFaultPositions(violation.faults)}）。時刻は HH:MM・ISO の日時・分の数のどれか1つに揃え（日をまたぐなら ISO）、同じ lane の行は start の昇順、extra は昇順、end は start より後、出来事は at の昇順にし、\`emphasis\` は行の \`name\` と同じ字にする`
    case "figure-number-mismatch":
      return `\`Plot\` の値とずれた数が本文にある（${figureNumberFaultPositions(violation.faults)}）。単位と丸めを \`Plot\` の値に揃えて、本文の数を直す`
    case "plot-forbidden-form":
      return `\`Plot\` の \`form\` が置いてはならない形に当たる部品が${violation.count}個ある（${violation.rules.join("・")}）。\`form\` を省いて決定表の形に任せる`
    case "plot-form-override":
      return `\`Plot\` の \`form\` が決定表の形と違う部品が${violation.count}個ある。決定表の形で足りるなら \`form\` を省く`
    case "plot-title-without-number":
      return `棒・折れ線・円で描く \`Plot\` の \`question\` に数が無い部品が${violation.count}個ある。題に数と向きで言いたい傾向を1文で書く`
  }
}
