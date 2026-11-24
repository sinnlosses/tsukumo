// 塊の違反を、差し戻すときの1行の文面にする。

import {
  MAX_CHART_GRID_PANELS,
  MIN_CHART_GRID_PANELS,
} from "../../../../../shared/report/report-block-diagram.ts"
import {
  MAX_EMPHASIS_ROWS,
  MAX_LIST_ITEMS,
  MAX_PLAIN_CODE_LINES,
  MAX_TABLE_ROWS,
  SENTENCE_CELL_LENGTH,
} from "../../../../../shared/report/report-limit.ts"
import type { BlockViolation } from "../block.ts"

/** 塊の違反を、差し戻すときの1行の文面にする。 */
export function blockViolationMessage(violation: BlockViolation): string {
  switch (violation.kind) {
    case "too-many-notes":
      return `\`Note\` が${violation.count}個ある。2個まで減らす`
    case "crowded-notes":
      return `隣り合う、または見出しの直後にある \`Note\` が${violation.count}個ある。間に別の部品を挟むか、\`Paragraph\` に直す（\`warn\` / \`ng\` は例外）`
    case "nested-fold":
      return `\`fold\` と \`<details>\` が入れ子になっている部品が${violation.count}個ある。畳むのは1段だけにする`
    case "unordered-options":
      return `候補が採る → 検討 → 採らないの順に並んでいない \`Options\` が${violation.count}個ある。採る候補から順に並べ直す`
    case "ragged-table":
      return `行のセルの数が \`columns\` と揃わない表（\`Matrix\` とその \`footer\` の行を含む）が${violation.count}個ある。セルの数を揃える`
    case "long-table":
      return `行が${String(MAX_TABLE_ROWS + 1)}以上で \`rest\` が空の表が${violation.count}個ある。上位${String(MAX_TABLE_ROWS)}行までを残し、残りを \`rest\` に書く`
    case "many-emphasis-rows":
      return `強調の行（\`emphasis\`）が${String(MAX_EMPHASIS_ROWS + 1)}行以上の表が${violation.count}個ある。強調は${String(MAX_EMPHASIS_ROWS)}行までに絞る`
    case "sentence-table":
      return `セルの平均が${String(SENTENCE_CELL_LENGTH)}字以上の列がある表が${violation.count}個ある。その列を \`label\` 付きの \`ItemList\` か \`Paragraph\` へ移すか、セルを語句・数・状態に縮める`
    case "long-list":
      return `項目が${String(MAX_LIST_ITEMS + 1)}件以上の \`ItemList\` が${violation.count}個ある。上位を残し、最後の項目を「ほか n 件」にして${String(MAX_LIST_ITEMS)}件までにする`
    case "bad-cards":
      return `\`cards\` の \`ItemList\` が項目数 2〜4 か、全項目に \`label\` を付ける形になっていない（${violation.faults
        .map(
          ({ position, itemCount, unlabeled }) =>
            `${String(position)}個目の部品は${String(itemCount)}項目${unlabeled ? "で `label` の空がある" : ""}`,
        )
        .join("・")}）。2〜4 項目に絞り全項目に題を付けるか、\`bullet\` / \`flow\` に直す`
    case "long-code":
      return `\`marks\` が無く${String(MAX_PLAIN_CODE_LINES + 1)}行以上の \`Code\` が${violation.count}個ある。要る範囲だけを引く（${String(MAX_PLAIN_CODE_LINES)}行まで）`
    case "ragged-chart":
      return `\`series\` の \`values\` の数が \`labels\` と揃わない、または \`arrow\`・\`slope\`・\`span\` の \`series\` が前と後（span は始まりと終わり）の2つでない \`Chart\` が${violation.count}個ある。数を揃える`
    case "chart-grid-shape":
      return `\`panels\` が${String(MIN_CHART_GRID_PANELS)}〜${String(MAX_CHART_GRID_PANELS)}個の外、\`values\` の数が \`labels\` と揃わない系列がある、または \`panels\` の間で系列の \`name\` の組が違う \`ChartGrid\` が${violation.count}個ある。図を${String(MIN_CHART_GRID_PANELS)}〜${String(MAX_CHART_GRID_PANELS)}個にし、どの図も同じ名前の系列を \`labels\` と同じ数の値で書く`
    case "emphasis-column-range":
      return `\`emphasisColumn\` が列の数以上の表（\`Matrix\` を含む）が${violation.count}個ある。列の数より小さい位置（0 始まり）にする`
    case "best-column-range":
      return `行の \`best\` が列の数以上（\`totals\` の計の列を含む）の表が${violation.count}個ある。\`columns\` の列の数より小さい位置（0 始まり）にする`
    case "heat-range":
      return `\`heat\` の範囲が列の外か範囲に数でないセルがある、または \`totals\` に \`heat\` が無いか範囲に % のセルがある表が${violation.count}個ある。\`heat\` は 0 以上の数だけの列（0 始まり・from ≦ to）に当て、\`totals\` は % でない数の範囲に付ける`
    case "row-depth":
      return `\`depth\` が最初の行で 0 でないか前の行より2段以上深い、または \`depth\` と \`totals\` を併せ持つ表が${violation.count}個ある。最初の行は \`depth\` を書かず、子は親の直下に1段深く置き、字下げのある表には \`totals\` を付けない`
    case "unknown-emphasis":
      return `\`emphasis\` に \`labels\` に無い名前がある \`Chart\` が${violation.count}個ある。\`labels\` にある名前だけにする`
    case "chart-annotation-range":
      return `\`references\` を \`line\` 以外に付けた、\`annotations\` を \`line\`・\`bar\`・\`share\`・\`arrow\` 以外に付けた、または \`annotations\` の \`label\` が \`series\` の \`name\`（\`share\` は先頭の系列だけ）に無いか \`index\` が \`labels\` の外の \`Chart\` が${violation.count}個ある。\`references\` は \`line\` に、\`annotations\` は \`line\`・\`bar\`・\`share\`・\`arrow\` に付け、\`label\` は \`series\` の \`name\`、\`index\` は \`labels\` の数より小さい位置（0 始まり）にする`
    case "chart-tone-range":
      return `\`tones\` を \`share\` 以外に付けた、長さが \`labels\` と違う、または \`emphasis\` と併せた \`Chart\` が${violation.count}個ある。\`tones\` は \`share\` だけに \`labels\` と同じ数で書き、\`emphasis\` は空にする`
    case "short-series":
      return `\`Stats\` の \`series\` が1〜2個の項目がある部品が${violation.count}個ある。3つ以上にするか省く`
    case "code-mismatch":
      return `\`path\` 付きの \`Code\` が${violation.count}個、ファイルの中身と一致しない（${violation.paths.join("・")}）。実物を読み直して直すか \`path\` を外す`
    case "code-marks-range":
      return `\`Code\` の \`marks\` の \`lines\` が読めない形か \`source\` の行数の外にある部品が${violation.count}個ある。\`4-8\` か \`12\` の形で、行数以内に直す`
    case "region-range":
      return `\`Compare\` の画像の側の \`region\` が画像の外に出る、または \`width\`・\`height\` が 0 以下の部品が${violation.count}個ある。\`left\`・\`top\` は 0 以上、\`left + width\` と \`top + height\` は 100 以下、\`width\`・\`height\` は 0 より大きい%にする`
    case "figure-contradiction":
      return violation.reason === "no-shape"
        ? `\`figure\` の reason が \`no-shape\` なのに、\`Section\` に流れ・つながり・構造を描く部品（\`ItemList\` の \`flow\`・\`Compare\` の \`before-after\`・\`Graph\`・\`Mermaid\`・\`Svg\`）が${violation.count}個ある。その図を \`figure\` に置くか、合う reason にする`
        : `\`figure\` の reason が \`short-answer\` なのに、セクションが2つ以上ある。2〜3文で終わる答えでなければ \`figure\` に図を置くか、合う reason にする`
  }
}
