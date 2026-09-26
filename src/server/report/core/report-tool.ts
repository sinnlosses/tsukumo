// `report` ツールまわりの決まりごと（docs/glossary.md「report ツール」）。仕事のセッションでは
// レポートを常にこのツールで受け取る。雑談のときは載せない（雑談は本文を書かない決まり。
// `docs/chat-mode.md`）。ツールを載せるのは MCP ツールを組み立てるアダプタ、呼び出しを
// イベントに変えるのは `toSessionEvents`、書き方の規約は `REPORT_NOTATION_PROMPT`。
//
// ここに置くのは、ツールの説明文と `Stop` フックの関所（`createReportGate`。登録は
// SDK を起こすアダプタ）。通った `report` はそこでターンを閉じる（handler が結果に
// `claude/endTurn` を付ける）ので、`report` のあとに本文が書かれることは無い。関所が止めるのは
// `report` を呼ばずに1行を超える本文を書いて止まろうとしたターンだけで、`report` で渡し直させる。
// `report` の呼び出しそのものの検査と差し戻しは `ReportReview`（こちらは描く前の検査の段）。

import { MAX_SESSION_HEADING_LENGTH } from "../../../shared/session-choice.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"

/**
 * モデルに見せる `report` ツールの説明。記法の条はここに書かず、規約の節を1行で指す
 * （MCP ツールの説明文は既定で 2048 字までしか渡らず、規約の全文は入らない）。
 */
export const REPORT_TOOL_DESCRIPTION =
  "ターンのレポートをメインビューに出す。conclusion → checks（検証結果の帯）→ body → favor の順に描かれ、" +
  "そのあと closing のセリフが吹き出しに出る。受け付けられるとそこでターンが終わる（あとに何も書けない）。" +
  "書き方は「レポートの記法（tsukumo）」の節に従う。"

/**
 * `report` の任意の `checks` 引数の説明。記法の条（`REPORT_NOTATION_PROMPT` の条1）と同じことを
 * 引数の側でも言う（どちらを先に読んでも欄を取り違えないように）。
 */
export const REPORT_CHECKS_DESCRIPTION =
  "検証の結果（テスト・型検査・手で確かめたこと）。tsukumo が結論の下に帯で描く。" +
  "ここに入れた結果は conclusion と body に書かない。検証をしていないターンでは省く。" +
  "label と detail は素の文字で描かれるので、バッククォートなどの記法を使わない。"

/**
 * `report` の `closing` 引数（締めのセリフ）の説明。`report` はターンを閉じるので、締めの一言は
 * あとから `speak` で言えず、ここで受け取る。
 */
export const REPORT_CLOSING_DESCRIPTION =
  "締めのセリフ（speak と同じ text と expression）。レポートを描いたあとに吹き出しに出る。" +
  "書き終えたことを言う一言にし、レポートの中身を言い直さない。"

/**
 * `report` の任意の `title` 引数の説明。セッション一覧の見出しにする題を付けさせる条はここだけ
 * （人格ではなく tsukumo 側の条に書く）。利用者の `/rename` を上書きしない判断はモデルに任せず、
 * `decideSessionTitle` が持つ。
 */
export const REPORT_TITLE_DESCRIPTION =
  `セッション一覧の見出しにする短い題（${String(MAX_SESSION_HEADING_LENGTH)}字以内）。` +
  "話の中心がはっきりした最初と、大きく変わったときだけ渡す。変える必要が無ければ省く。"

/**
 * `Stop` の関所が差し戻すときにモデルへ返す理由。
 * 固定の文面だけで、モデルが書いた本文は写さない（会話の中身をモデルの文脈へ戻す経路を作らない）。
 * 差し戻しは利用者の画面に出ないので、セリフで触れさせない（触れると利用者には意味の通らない
 * 言い訳になる）。
 */
export const REPORT_GATE_REASON =
  "いま書いた本文は画面に出ていない。その内容を `report` ツール（`mcp__tsukumo__report`）で" +
  "渡し直すこと。締めの一言は `report` の closing に入れる（`report` が通るとそこでターンが終わる）。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/**
 * `Stop` の関所。届いたイベントを {@link ReportGate.observe} で見て、SDK のターンの頭から書いた
 * 本文を覚えておき、止まろうとしたときに {@link ReportGate.verdict} が差し戻すか（と、その理由）を
 * 決める。`report` が届いたら覚えた本文を捨てる（通った `report` はターンを閉じるので、そのターンの
 * 本文は `report` の前に書いたものだけ）。
 *
 * - ターンの頭は `session-info`（`init` は SDK のターンの頭に毎回届く。依頼で始まるターンも、
 *   背景のタスクやサブエージェントの合図で claude が自分で始めるターンも同じ）。`turn-finished`
 *   でも空に戻す（`init` が来ない経路があっても前のターンの本文を持ち越さない）
 * - 本文は `utterance` だけを数える（書きかけの断片は、同じ本文が `utterance` で届き直す）
 * - サブエージェントの中の本文は渡さないこと（呼び出し側の仕事。委譲先の報告はメインにだけ
 *   届くもので、画面に出すかの判断はメインの本文で決まる）
 */
export type ReportGate = {
  readonly observe: (event: SessionEvent) => void
  /**
   * 差し戻すか。`stopHookActive`（すでに一度差し戻して続けているところ）なら差し戻さない
   * （ループさせない）。それ以外は、覚えた本文が1行を超えていれば差し戻す。
   */
  readonly verdict: (stopHookActive: boolean) => ReportGateVerdict
}

/** 関所の判定。差し戻すときはモデルへ返す理由を持つ。 */
export type ReportGateVerdict =
  | { readonly kind: "pass" }
  | { readonly kind: "block"; readonly reason: string }

/** {@link ReportGate} を1つ作る。セッション1つに1つ（ターンの区切りを自分で見ている）。 */
export function createReportGate(): ReportGate {
  let unreported: readonly string[] = []

  return {
    observe: (event) => {
      unreported = nextUnreported(unreported, event)
    },
    verdict: (stopHookActive) =>
      stopHookActive || !exceedsOneLine(unreported)
        ? { kind: "pass" }
        : { kind: "block", reason: REPORT_GATE_REASON },
  }
}

/**
 * 「1行」の字数の上限（コードポイントで数える）。改行を含まなくても、これを超えたら1行と
 * 見なさない（改行の無い段落1つでレポートを書き切ることがあるため）。試行で通ってよかった
 * 1行（背景の委譲を待つ一言など）は64字以下、差し戻すべき
 * だった本文は131字以上だった（`docs/research/report-tool-trial.md`）。その間に余裕を取って置く。
 */
const ONE_LINE_MAX_CHARS = 100

/** SDK のターンの頭（か最後の `report`）からいままでに書いた本文の並び。 */
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
