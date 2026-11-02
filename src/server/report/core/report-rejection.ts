// 規約違反を、差し戻すときの `report` の戻り値の文面にする。

import type { A2uiStructureFault, A2uiStructureFaultKind } from "./a2ui-structure-fault.ts"
import type { ReportViolation } from "./report-violation.ts"
import { blockViolationMessage } from "./rules/block.ts"
import { figureViolationMessage } from "./rules/figure.ts"
import { plainWordReplacements, proseViolationMessage } from "./rules/prose.ts"

/** 差し戻しの戻り値に足す、呼び直し方（`components` は全部、`Report` の欄は省けば引き継ぐ）の1文。 */
export const REPORT_CHANGED_FIELDS_ONLY_TEXT =
  "呼び直すときは `components` を全部渡す（`Report` の欄は、省けばこの呼び出しの値を引き継ぐ）。"

/**
 * 差し戻すときの `report` の戻り値。
 * 違反した条と直し方だけを1行ずつ並べ、画面の状態（描けたか・どこに出たか）は載せない。モデルの文脈に戻るので短くする。
 */
export function reportRejectionText(violations: readonly ReportViolation[]): string {
  return [
    "レポートの記法の規約に次の違反がある。直して `report` を呼び直すこと:",
    ...violations.map((violation) => `- ${violationLine(violation)}`),
    REPORT_CHANGED_FIELDS_ONLY_TEXT,
  ].join("\n")
}

/**
 * `a2ui` の版で構造の規約に外れたときの `report` の戻り値。
 * 違反 1 つにつき A2UI の `VALIDATION_FAILED` のエラーのメッセージ 1 行（JSON）で、理由は種類ごとの固定の文だけを載せ、書き手の ID・文面は写さない。
 */
export function a2uiValidationFailedText(faults: readonly A2uiStructureFault[]): string {
  return [
    ...faults.map((fault) =>
      JSON.stringify({
        version: A2UI_VERSION,
        error: {
          code: "VALIDATION_FAILED",
          surfaceId: A2UI_REPORT_SURFACE_ID,
          path: fault.pointer,
          message: A2UI_STRUCTURE_FAULT_REASONS[fault.kind],
        },
      }),
    ),
    "直して `components` を全部渡し、`report` を呼び直すこと。",
  ].join("\n")
}

const A2UI_VERSION = "v0.9"

const A2UI_REPORT_SURFACE_ID = "report"

const A2UI_STRUCTURE_FAULT_REASONS = {
  "unknown-component": "カタログに無い部品",
  "duplicate-id": "同じ id の部品がほかにある",
  "missing-root": "id が root の Report が無い",
  "root-not-report": "id が root の部品は Report にする",
  "undefined-reference": "参照先の id の部品が無い",
  "report-child-not-section": "Report.children には Section の id だけを置く",
  "nested-section": "Section の子に Section は置けない",
  "misplaced-component": "ここに置けない種類の部品",
  "deep-layout": "配置の部品の入れ子は 3 階層まで",
  "memo-without-owner":
    "セクションの先頭に tone が memo の Note は置けない（寄せ先が無く何も描かれない）。Paragraph などを先に置き、その後ろに Note を置く",
  "figure-not-figure-part": "Report.figure には図の部品の id を置く",
  "unreferenced-component": "どこからも参照されない部品",
  "filter-target-missing": "value の path が指す id の Table が無い（/view/<Table の id>/filter）",
  "filter-target-not-filterable": "value の path が指す Table に filterable: true が無い",
  "filter-option-not-in-cells": "選択肢の value が、絞り込む Table のセルの文字に無い",
} as const satisfies Record<A2uiStructureFaultKind, string>

/** `speak` のセリフの地の文に表の語があるときの戻り値。表から取った語だけで、セリフの文面は写さない。 */
export function speechPlainWordRejectionText(spellings: readonly string[]): string {
  return `地の文にわかりにくい語がある。${plainWordReplacements(spellings)}。このセリフは画面に出していないので、言い換えて書き直して呼び直す（コード・引用の中は対象外）`
}

function violationLine(violation: ReportViolation): string {
  switch (violation.kind) {
    case "long-conclusion":
    case "untitled-section":
    case "markdown-notation":
    case "long-first-sentence":
    case "bad-heading":
    case "arrow-in-prose":
    case "label-in-item":
    case "labeled-ordered":
    case "non-japanese":
    case "plain-word":
    case "broken-inline-mark":
      return proseViolationMessage(violation)
    case "unknown-mermaid":
    case "broken-svg":
    case "unlegended-svg-tone":
    case "unlegended-graph-tone":
    case "broken-graph":
    case "broken-timeline":
    case "figure-number-mismatch":
    case "plot-forbidden-form":
    case "plot-form-override":
    case "plot-title-without-number":
      return figureViolationMessage(violation)
    case "too-many-notes":
    case "crowded-notes":
    case "nested-fold":
    case "unordered-options":
    case "ragged-table":
    case "long-table":
    case "many-emphasis-rows":
    case "sentence-table":
    case "long-list":
    case "bad-cards":
    case "long-code":
    case "ragged-chart":
    case "unknown-emphasis":
    case "short-series":
    case "code-mismatch":
    case "code-marks-range":
    case "region-range":
    case "figure-contradiction":
      return blockViolationMessage(violation)
    case "unobserved-without-how":
      return `\`checks\` の \`unobserved\` の行のうち \`howToVerify\` が空のものが${violation.count}個ある。知らない人が繰り返せる確かめ方を1〜2文で書く`
    case "template-miss":
      return `申告した依頼の型の雛形から外れた点がある（${violation.misses.join("・")}）。数の帯 \`keyFigures\` を足すか、図 1 を型の第一候補の種類にする`
  }
}
