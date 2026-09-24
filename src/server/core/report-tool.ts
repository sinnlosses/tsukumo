// `report` ツールまわりの決まりごと（docs/glossary.md「report ツール」）。仕事のセッションでは
// レポートを常にこのツールで受け取る。**雑談のときは載せない**（雑談は本文を書かない決まり。
// `docs/chat-mode.md`）。ツールを載せるのは `src/server/adapter/sdk-tool.ts`、呼び出しを
// イベントに変えるのは `src/server/core/sdk-message.ts`、書き方の規約は `report-notation.ts`。
//
// ここに置くのは、ツールの説明文と `Stop` フックの関所（{@link createReportGate}。登録は
// `src/server/adapter/sdk-driver.ts`）。関所は、SDK のターンの最後の `report` のあと（無ければ
// ターンの頭から）に1行を超える本文を書いて止まろうとしたら差し戻し、`report` で渡し直させる。
// `report` の呼び出しそのものの検査と差し戻しは `report-review.ts`（こちらは描く前の検査の段）。

import { MAX_SESSION_HEADING_LENGTH } from "../../shared/session-choice.ts"
import { type SessionEvent } from "../../shared/session-event.ts"

/**
 * モデルに見せる `report` ツールの説明。**記法の条はここに書かず、規約の節を1行で指す**
 * （MCP ツールの説明文は既定で 2048 字までしか渡らず、規約の全文は入らない）。
 */
export const REPORT_TOOL_DESCRIPTION =
  "ターンのレポートをメインビューに出す。conclusion → body → favor の順に描かれる。" +
  "書き方は「レポートの記法（tsukumo）」の節に従う。"

/**
 * `report` の任意の `title` 引数の説明。**セッション一覧の見出しにする題を付けさせる条はここだけ**
 * （人格ではなく tsukumo 側の条に書く）。利用者の `/rename` を上書きしない判断はモデルに任せず、
 * `session-title.ts` が持つ。
 */
export const REPORT_TITLE_DESCRIPTION =
  `セッション一覧の見出しにする短い題（${String(MAX_SESSION_HEADING_LENGTH)}字以内）。` +
  "話の中心がはっきりした最初と、大きく変わったときだけ渡す。変える必要が無ければ省く。"

/**
 * `Stop` の関所が差し戻すときにモデルへ返す理由。**固定の文面だけ**で、モデルが書いた本文は
 * 写さない（会話の中身をモデルの文脈へ戻す経路を作らない）。
 */
export const REPORT_GATE_REASON =
  "いま書いた本文は画面に出ていない。その内容を `report` ツール（`mcp__tsukumo__report`）で" +
  "渡し直すこと。前に渡した `report` を同じ引数で送り直さない（送り直しは差し戻す）。" +
  "`report` のあとに書いてよいのは締めの `speak` だけ。"

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
