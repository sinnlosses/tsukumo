// 規約違反を、差し戻すときの `report` の戻り値の文面にする。

import {
  MAX_CANDIDATES,
  MAX_HEADING,
  MAX_FIRST_SENTENCE,
  MAX_LIST_ITEMS,
  MAX_PLAIN_CODE_LINES,
  MAX_TABLE_ROWS,
  SENTENCE_CELL_LENGTH,
} from "../../../shared/report/report-limit.ts"
import {
  graphFaultPositions,
  mermaidFaultPositions,
  svgFaultPositions,
} from "./report-figure-fault.ts"
import { MARKDOWN_NOTATION_NAMES } from "./report-markdown-notation.ts"
import type { ReportViolation } from "./report-violation.ts"

/** 差し戻しの戻り値に足す、直す欄だけで呼び直せることの1文。 */
export const REPORT_CHANGED_FIELDS_ONLY_TEXT =
  "呼び直すときは直す欄だけを渡せばよい（渡さなかった欄はこの呼び出しの値を引き継ぐ）。"

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

function violationLine(violation: ReportViolation): string {
  switch (violation.kind) {
    case "long-conclusion":
      return `\`conclusion\` が${violation.count}文ある。2文以内にし、残りは \`sections\` へ移す`
    case "long-paragraph":
      return `4文以上の地の文が${violation.count}個ある。表・箇条書きへ移すか、\`fold\` で畳む`
    case "unknown-mermaid":
      return `mermaid の図に規約の9種の外の種類が${violation.count}個ある。flowchart は graph の塊で書き、それ以外は9種から選ぶ`
    case "too-many-notes":
      return `\`note\` の塊が${violation.count}個ある。2個まで減らす`
    case "crowded-notes":
      return `隣り合う、または見出しの直後にある \`note\` が${violation.count}個ある。間に別の塊を挟むか、\`text\` に直す（\`warn\` / \`ng\` は例外）`
    case "nested-fold":
      return `\`fold\` と \`<details>\` が入れ子になっている塊が${violation.count}個ある。畳むのは1段だけにする`
    case "too-many-candidates":
      return `候補・箇条・説明が${String(MAX_CANDIDATES + 1)}つ以上の \`options\` / \`compare\` / \`beforeAfter\` / \`image\` の \`notes\` が${violation.count}個ある。${String(MAX_CANDIDATES)}つまでに絞る`
    case "unordered-options":
      return `候補が採る → 検討 → 採らないの順に並んでいない \`options\` が${violation.count}個ある。採る候補から順に並べ直す`
    case "ragged-table":
      return `行のセルの数が \`columns\` と揃わない表（\`matrix\` を含む）が${violation.count}個ある。セルの数を揃える`
    case "long-table":
      return `行が${String(MAX_TABLE_ROWS + 1)}以上で \`rest\` が空の表が${violation.count}個ある。上位${String(MAX_TABLE_ROWS)}行までを残し、残りを \`rest\` に書く`
    case "sentence-table":
      return `セルの平均が${String(SENTENCE_CELL_LENGTH)}字以上の列がある表が${violation.count}個ある。その列を \`label\` 付きの \`list\` か文の塊へ移すか、セルを語句・数・状態に縮める`
    case "long-list":
      return `項目が${String(MAX_LIST_ITEMS + 1)}件以上の \`list\` が${violation.count}個ある。上位を残し、最後の項目を「ほか n 件」にして${String(MAX_LIST_ITEMS)}件までにする`
    case "long-code":
      return `\`marks\` が無く${String(MAX_PLAIN_CODE_LINES + 1)}行以上の \`code\` が${violation.count}個ある。要る範囲だけを引く（${String(MAX_PLAIN_CODE_LINES)}行まで）`
    case "ragged-chart":
      return `\`series\` の \`values\` の数が \`labels\` と揃わない、または \`arrow\`・\`slope\`・\`span\` の \`series\` が前と後（span は始まりと終わり）の2つでない \`chart\` の塊が${violation.count}個ある。数を揃える`
    case "short-series":
      return `\`stats\` の \`series\` が1〜2個の項目がある塊が${violation.count}個ある。3つ以上にするか省く`
    case "untitled-section":
      return `見出しの無い節が${violation.count}個ある。節が2つ以上なら全部に \`heading\` を付ける`
    case "markdown-notation":
      return `\`markdown\` の塊に塊で書ける記法（${violation.notations
        .map((notation) => MARKDOWN_NOTATION_NAMES[notation].written)
        .join("・")}）がある。代わりに${violation.notations
        .map((notation) => MARKDOWN_NOTATION_NAMES[notation].replacement)
        .join("・")}を使う`
    case "code-mismatch":
      return `\`path\` 付きの \`code\` の塊が${violation.count}個、ファイルの中身と一致しない（${violation.paths.join("・")}）。実物を読み直して直すか \`path\` を外す`
    case "code-marks-range":
      return `\`code\` の \`marks\` の \`lines\` が読めない形か \`source\` の行数の外にある塊が${violation.count}個ある。\`4-8\` か \`12\` の形で、行数以内に直す`
    case "region-range":
      return `\`beforeAfter\` の画像の側の \`region\` が画像の外に出る、または \`width\`・\`height\` が 0 以下の塊が${violation.count}個ある。\`left\`・\`top\` は 0 以上、\`left + width\` と \`top + height\` は 100 以下、\`width\`・\`height\` は 0 より大きい%にする`
    case "broken-mermaid":
      return `mermaid の図の構文が割れている（${mermaidFaultPositions(violation.faults)}）。その行の書き方を直す`
    case "broken-svg":
      return `\`svg\` の図形が \`width\` × \`height\` の外に出ている（${svgFaultPositions(violation.faults)}）。座標か大きさを直す`
    case "broken-graph":
      return `\`graph\` の \`source\` に読めない行がある（${graphFaultPositions(violation.faults)}）。1行を \`A -> B: 語\` の形に直す（\`: 語\` は省ける）。囲みは \`[群の名]\` 〜 \`[]\` の1階層で、入れ子と閉じ忘れは読めない`
    case "long-first-sentence":
      return `\`conclusion\` の1文目がいま${String(violation.length)}字で、全角${String(MAX_FIRST_SENTENCE)}字を超える。1文目を短くし、補足は2文目か \`sections\` へ移す`
    case "bad-heading":
      return `見出しが${violation.count}個、${String(MAX_HEADING)}字を超えるか疑問文になっている。その節の結論を言う短い語にする`
    case "fraction-figure":
      return `\`checks\` の \`figure\` に分数（数 / 数）がある項目が${violation.count}個ある。「56 件中 1 件」のように言い換える`
    case "unverified-without-how":
      return `\`checks\` の \`unverified\` の行のうち \`howToVerify\` が空のものが${violation.count}個ある。知らない人が繰り返せる確かめ方を1〜2文で書く`
    case "arrow-in-prose":
      return `地の文・表のセルに \`A → B\` と書いた塊が${violation.count}個ある。セルは \`from\` / \`to\`、流れは \`list\` の \`flow\` にする`
    case "label-in-item":
      return `\`list\` の項目の \`text\` が「名前: 説明」の形になっているものが${violation.count}個ある。名前を \`label\` に分ける`
    case "labeled-ordered":
      return `全部の項目に \`label\` がある3段以上の \`ordered\` の \`list\` が${violation.count}個ある。名前の付いた段を辿る流れは \`flow\` にする`
    case "non-japanese":
      return `仮名も漢字も無い英語の地の文・見出しが${violation.count}個ある。日本語で書き直す（識別子・パス・コマンド・コードは \`\` で囲めば英語のままでよい）`
    case "figure-contradiction":
      return violation.reason === "no-shape"
        ? `\`figure\` の reason が \`no-shape\` なのに、\`sections\` に流れ・つながり・構造を描く塊（\`list\` の \`flow\`・\`beforeAfter\`・\`graph\`・\`mermaid\`・\`svg\`）が${violation.count}個ある。その図を \`figure\` に置くか、合う reason にする`
        : `\`figure\` の reason が \`short-answer\` なのに、節が2つ以上あるか4文以上の地の文がある。2〜3文で終わる答えでなければ \`figure\` に図を置くか、合う reason にする`
  }
}
