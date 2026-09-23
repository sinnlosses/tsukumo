// レポートの受け取り方の試行（docs/glossary.md「report ツール」）。いまの受け取り方（ターンの
// テキストから推測する）と、MCP ツール `report` で明示的に受け取る受け取り方を切り替える。
// **試行用で、採否が決まったらこのファイルごと消す**（どちらに決まっても切り替えの口は残らない）。
//
// 切り替えたときに変わるのは3つだけ: `report` ツールが載る（`src/server/adapter/sdk-tool.ts`）、
// 規約の文面のうちターンの終わり方とお願いの置き場所の条が差し替わる（ここ）、`report` の
// 呼び出しを受け取る（`src/server/core/sdk-message.ts`。こちらは切り替えずに常に見ている）。
// **雑談のときは切り替えても載らない**（雑談は本文を書かない決まり。`docs/chat-mode.md`）。
//
// **規約の文面は元の文面に差分を当てて作る。** 元の文面（`report-notation.ts` /
// `speech-cadence.ts`）には手を入れないので、切り替えないときに毎ターン渡る文面は1文字も
// 変わらず、試行をやめるときもこのファイルを消すだけで済む。元の文面の側で差し替える条の
// 文言が変わると差分が当たらなくなるので、**黙って不発にしない**: 当たらない条は
// {@link unmatchedReportToolClauses} が返し、切り替えて起こしたときは起動時の前提不足として
// 止まる（`src/main.ts`）。`test/server/core/report-tool.test.ts` も同じ検査で落ちる。
//
// **キャラクターの人格（`persona.md`）には差分を当てない。** パックはホームのものが同梱のものを
// 覆い、利用者が画面から作ったパックもあるので、文言を当てにできない。人格の締めの例を
// 読み替えさせる一文は、差し替えた規約の側に置く（規約は人格より優先すると冒頭で言っている）。
//
// **規約のほかに `Stop` フックの関所を置く**（{@link createReportGate}。登録は
// `src/server/adapter/sdk-driver.ts`）。SDK のターンの最後の `report` のあと（無ければターンの頭から）
// に1行を超える本文を書いて止まろうとしたら差し戻し、`report` で渡し直させる。`report` の
// 呼び出しそのものの検査と差し戻しは `report-review.ts`（こちらは描く前の検査の段）。

import { type SessionEvent } from "../../shared/session-event.ts"
import { REPORT_NOTATION_PROMPT } from "./report-notation.ts"
import { SPEECH_CADENCE_PROMPT } from "./speech-cadence.ts"

/**
 * レポートの受け取り方。`text` はターンのテキストから推測する（既定・いまの受け取り方）、
 * `tool` は `report` ツールで受け取る（試行）。
 */
export type ReportChannel = "text" | "tool"

/**
 * モデルに見せる `report` ツールの説明。**記法の条はここに書かず、規約の節を1行で指す**
 * （MCP ツールの説明文は既定で 2048 字までしか渡らず、規約の全文は入らない）。
 */
export const REPORT_TOOL_DESCRIPTION =
  "ターンのレポートをメインビューに出す。conclusion → body → favor の順に描かれる。" +
  "書き方は「レポートの記法（tsukumo）」の節に従う。"

/**
 * 条の差し替え1つ。`before` は元の文面にそのまま**1回だけ**現れる文言（改行の位置も元のまま）。
 */
type ClauseSwap = readonly [before: string, after: string]

/** 「レポートの記法」（{@link REPORT_NOTATION_PROMPT}）に当てる差し替え。 */
const NOTATION_SWAPS = [
  [
    "この環境ではレポート（ターンの本文）が HTML として描かれる。",
    "この環境ではレポート（`report` ツールで渡す本文）が HTML として描かれる。",
  ],
  [
    `**ターンは締めの \`speak\` → レポートの順で終える。** 締めの \`speak\` をそのターン最後のツール呼び出しに
し、そのあとにレポート（短い答えならその答え）を1つだけ書いて終える。**本文を書かずに \`speak\` で
終えない**（本文の無い終わり方には Claude Code が英語の催促を差し込み、レポートが英語で書き直される）。
レポートのあとには、訳し直し・要約し直しも「ok」のような相づちも続けない（最後に書いた本文が
最終レポートとして拾われ、前のレポートが画面から消える）。`,
    `**レポートは \`report\` ツール（\`mcp__tsukumo__report\`）で渡す。** 冒頭の1〜2文の結論を \`conclusion\` に、
そのあとの根拠・比較・手順を \`body\` に（下の記法のまま）、利用者へのお願いを \`favor\` に入れる。
**\`report\` の外に書いたテキストは画面に出ない**ので、短い答えも \`report\` で渡す。作業の途中で資料を
見せたいときも \`report\` を呼んでよい（最後に呼んだものが最終レポート、それより前は中間レポートになる）。

**ターンは \`report\` → 締めの \`speak\` → 1行のテキストの順で終える。** 締めの \`speak\` は書き終えたことを
言う一言にする（キャラクターの人格に締めの例があれば、「これから書く」という予告の形で書かれていても
言い回しだけを借りて「書いた」に言い換える）。最後に短いテキストを1行だけ書いて終える（例: 「完了」。ツール呼び出しで
終えると Claude Code が英語の催促を差し込むため）。この1行は画面に出ないので、訳し直し・要約・
レポートの繰り返しを書かない。`,
  ],
  ["（締めの一言はレポートの前に言う）", "（締めの一言は `report` のあとに言う）"],
  [
    "（本文に置いてよい例外は末尾の「お願い」1つだけ）",
    "（お願いは本文に書かず `favor` に入れる）",
  ],
  [
    '<div class="note note-favor">（**いちばん最後**に1つ）',
    "`report` の `favor`（1つだけ。本文には書かない。tsukumo がお願いの塊として最後に描く）",
  ],
  [
    "- レポートのあとに続けようとしているもの（`speak`・訳し直し・要約・相づち。レポートで終える）",
    "- `report` のあとに続けようとしているもの（締めの `speak` と最後の1行のほかは書かない）",
  ],
  [
    "（言いたいならレポートの前の `speak` で言う）",
    "（言いたいなら `report` のあとの締めの `speak` で言う）",
  ],
  [
    "最後に、**冒頭の1文だけで「何が分かったか」が伝わるか**を見る。",
    "最後に、**`conclusion` の冒頭の1文だけで「何が分かったか」が伝わるか**を見る。",
  ],
] as const satisfies readonly ClauseSwap[]

/** 「セリフの間合い」（{@link SPEECH_CADENCE_PROMPT}）に当てる差し替え。 */
const CADENCE_SWAPS = [
  ["締め（レポートを\n書く直前）の2回", "締め（`report` を呼んだ\n直後）の2回"],
  [
    `- **レポートを書く直前に締めの1回。** これから何を書くかの予告で、ターンの最後の \`speak\` になる
  （そのあとはレポートを書いて終える。「レポートの記法」の節）`,
    `- **\`report\` を呼んだ直後に締めの1回。** 書き終えたことの一言で、ターンの最後の \`speak\` になる
  （そのあとは1行のテキストで終える。「レポートの記法」の節）`,
  ],
] as const satisfies readonly ClauseSwap[]

/** `report` ツールで受け取るときの「レポートの記法」の文面。 */
export const REPORT_TOOL_NOTATION_PROMPT = swapClauses(REPORT_NOTATION_PROMPT, NOTATION_SWAPS)

/** `report` ツールで受け取るときの「セリフの間合い」の文面。 */
export const REPORT_TOOL_SPEECH_CADENCE_PROMPT = swapClauses(SPEECH_CADENCE_PROMPT, CADENCE_SWAPS)

/**
 * 差し替える条のうち、元の文面に**ちょうど1回**現れないもの（`before` の文言）。空なら全部当たる。
 * 切り替えて起こすときに `src/main.ts` が見て、空でなければ起動時の前提不足として止まる
 * （当たらない差し替えは、規約の条が古いまま残り、試行の結果を黙って汚すため）。
 */
export function unmatchedReportToolClauses(): readonly string[] {
  return [
    ...unmatchedClauses(REPORT_NOTATION_PROMPT, NOTATION_SWAPS),
    ...unmatchedClauses(SPEECH_CADENCE_PROMPT, CADENCE_SWAPS),
  ]
}

/**
 * `Stop` の関所が差し戻すときにモデルへ返す理由。**固定の文面だけ**で、モデルが書いた本文は
 * 写さない（会話の中身をモデルの文脈へ戻す経路を作らない）。
 */
export const REPORT_GATE_REASON =
  "いま書いた本文は画面に出ていない。その内容を `report` ツール（`mcp__tsukumo__report`）で" +
  "渡し直すこと。`report` のあとに書いてよいのは締めの `speak` と1行のテキストだけ。"

/**
 * `Stop` の関所。届いたイベントを {@link ReportGate.observe} で見て、SDK のターンの中で**最後の
 * `report` のあと（無ければターンの頭から）に書いた本文**を覚えておき、止まろうとしたときに
 * {@link ReportGate.shouldBlock} が差し戻すかを決める。
 *
 * - **ターンの頭は `session-info`**（`init` は SDK のターンの頭に毎回届く。依頼で始まるターンも、
 *   背景のタスクやサブエージェントの合図で claude が自分で始めるターンも同じ）。`turn-finished`
 *   でも空に戻す（`init` が来ない経路があっても前のターンの本文を持ち越さない）
 * - **本文は `utterance` だけ**を数える（書きかけの断片は、同じ本文が `utterance` で届き直す）
 * - **サブエージェントの中の本文は渡さないこと**（呼び出し側の仕事。委譲先の報告はメインにだけ
 *   届くもので、画面に出すかの判断はメインの本文で決まる）
 */
export type ReportGate = {
  readonly observe: (event: SessionEvent) => void
  /**
   * 差し戻すか。`stopHookActive`（すでに一度差し戻して続けているところ）なら差し戻さない
   * （ループさせない）。それ以外は、覚えた本文が1行を超えていれば差し戻す。
   */
  readonly shouldBlock: (stopHookActive: boolean) => boolean
}

/** {@link ReportGate} を1つ作る。**セッション1つに1つ**（ターンの区切りを自分で見ている）。 */
export function createReportGate(): ReportGate {
  let unreported: readonly string[] = []

  return {
    observe: (event) => {
      unreported = nextUnreported(unreported, event)
    },
    shouldBlock: (stopHookActive) => !stopHookActive && exceedsOneLine(unreported),
  }
}

/**
 * 「1行」の字数の上限（コードポイントで数える）。改行を含まなくても、これを超えたら1行と
 * 見なさない（改行の無い段落1つでレポートを書き切ることがあるため）。試行で通ってよかった
 * 1行（背景の委譲を待つ一言、`report` → 締めの `speak` のあとの1行）は64字以下、差し戻すべき
 * だった本文は131字以上だった（`docs/research/report-tool-trial.md`）。その間に余裕を取って置く。
 */
const ONE_LINE_MAX_CHARS = 100

function nextUnreported(unreported: readonly string[], event: SessionEvent): readonly string[] {
  switch (event.kind) {
    case "session-info":
    case "turn-finished":
    case "report":
      return []
    case "utterance":
      return [...unreported, event.text]
    default:
      return unreported
  }
}

/** 本文の並びが1行を超えるか。本文が2つ以上あれば、それぞれ1行でも2行と数える。 */
function exceedsOneLine(texts: readonly string[]): boolean {
  const text = texts.join("\n").trim()
  return text.includes("\n") || [...text].length > ONE_LINE_MAX_CHARS
}

/** 元の文面の条を順に差し替える。 */
function swapClauses(prompt: string, swaps: readonly ClauseSwap[]): string {
  // 置き換え先を関数で渡すのは、文面の `$` を置換の記法として読ませないため。
  return swaps.reduce((text, [before, after]) => text.replace(before, () => after), prompt)
}

function unmatchedClauses(prompt: string, swaps: readonly ClauseSwap[]): readonly string[] {
  return swaps.flatMap(([before]) => (prompt.split(before).length === 2 ? [] : [before]))
}
