// `report` ツールまわりの決まりごと。仕事のセッションではレポートを常にこのツールで受け取り、雑談のときは載せない（雑談は本文を書かない）。
//
// ここに置くのは、ツールの説明文と `Stop` フックの関所（`createReportGate`）。
// 通った `report` はそこでターンを閉じる（handler が結果に `claude/endTurn` を付ける）ので、`report` のあとに本文が書かれることは無い。
// 関所が止めるのは `report` を呼ばずに1行を超える本文を書いて止まろうとしたターンだけで、`report` で渡し直させる。
// `report` の呼び出しそのものの検査と差し戻しは `ReportReview` が持つ。

import { MAX_SESSION_HEADING_LENGTH } from "../../../shared/session/session-choice.ts"
import { MAX_SESSION_SUMMARY_LENGTH } from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"

/**
 * モデルに見せる `report` ツールの説明。記法の条はここに書かず、規約の節を1行で指す。
 * MCP ツールの説明文は既定で 2048 字までしか渡らず、規約の全文は入らない。
 */
export const REPORT_TOOL_DESCRIPTION =
  "ターンのレポートをメインビューに出す。task（目録の1行と見出し）→ conclusion → checks（検証結果の表）→ sections → favor の順に描かれ、" +
  "そのあと closing のセリフが吹き出しに出る。受け付けられるとそこでターンが終わる（あとに何も書けない）。" +
  "書き方は「レポートの記法（tsukumo）」の節に従う。"

/**
 * `report` の任意の `checks` 引数の説明。
 * 記法の条（`REPORT_NOTATION_PROMPT` の条1）と同じことを引数の側でも言う（どちらを先に読んでも欄を取り違えないように）。
 */
export const REPORT_CHECKS_DESCRIPTION =
  "検証の結果（テスト・型検査・手で確かめたこと）。tsukumo が結論の下に、全体の判定の札と、落ちた・確かめていない項目の行で描く。" +
  "ここに入れた結果は conclusion と sections に書かない。検証をしていないターンでは省く。" +
  "結果の数は figure に、打ったコマンドは command に分ける（所要時間は tsukumo が測って添えるので書かない）。" +
  "label・figure・detail は素の文字で描かれるので、バッククォートなどの記法を使わない。"

/**
 * `report` の任意の `task` 引数の説明。
 * 記法の条（`REPORT_NOTATION_PROMPT` の条1）と同じ書き分けを引数の側でも言う。
 */
export const REPORT_TASK_DESCRIPTION =
  "タスクの作業のレポートのときだけ渡す（タスクID・作業の名前・終わり方）。tsukumo が結論の上に" +
  "「最終レポート · タスクID · 終わり方」の1行と、作業の名前の見出しを描く。" +
  "渡したら conclusion に作業の名前やタスクID を書かず、これから何が変わるかだけを書く。" +
  "タスクに紐付かないターンでは省く。"

/**
 * `report` の任意の `sections` 引数（本文。節と塊の並び）の説明。
 * 塊の種類ごとの使いどころは各塊の `describe`（`reportBlockSchema`）が持つので、ここに書かない。
 */
export const REPORT_SECTIONS_DESCRIPTION =
  "結論のあとの根拠・比較・手順。節の並びで、節ごとに塊を並べる。" +
  "塊の文字で効くのはインラインの記法（inline code・太字・リンク）だけ。2〜3文で終わる答えでは省く。" +
  "塊の fold に見出しを書くと畳んで描く（畳んでも結論が通る塊だけ）。"

/**
 * `report` の `closing` 引数（締めのセリフ）の説明。
 * `report` はターンを閉じるので、締めの一言はあとから `speak` で言えず、ここで受け取る。
 */
export const REPORT_CLOSING_DESCRIPTION =
  "締めのセリフ（speak と同じ text と expression）。レポートを描いたあとに吹き出しに出る。" +
  "書き終えたことを言う一言にし、レポートの中身を言い直さない。"

/**
 * `report` の任意の `waitingLine` 引数（待ちの一言）の説明。
 * 出す時刻と回数は tsukumo が決める（`waitingLineDueAt`）ので、ここでは何を言うかだけを言う。
 */
export const REPORT_WAITING_LINE_DESCRIPTION =
  "待ちの一言（speak と同じ text と expression）。利用者が次の依頼を送らないまましばらく経ったら、吹き出しに1回だけ出る。" +
  "次の依頼を待っていることを言う一言にし、closing とレポートの中身を言い直さない。"

/**
 * `report` の任意の `title` 引数の説明。セッション一覧の見出しにする題を付けさせる条はここだけ。
 * 利用者の `/rename` を上書きしない判断はモデルに任せず、`decideSessionTitle` が持つ。
 */
export const REPORT_TITLE_DESCRIPTION =
  `セッション一覧の見出しにする短い題（${String(MAX_SESSION_HEADING_LENGTH)}字以内）。` +
  "話の中心がはっきりした最初と、大きく変わったときだけ渡す。変える必要が無ければ省く。"

/**
 * `report` の任意の `sessionSummary` 引数の説明。
 * 切り替え画面に出すセッション全体の要約を書かせる条はここと `REPORT_NOTATION_PROMPT` の1段落だけ。
 * 書いた値は transcript の `report` の入力に残り、切り替え画面はそれを読み戻す（tsukumo は別の場所へ書き出さない）。
 */
export const REPORT_SESSION_SUMMARY_DESCRIPTION =
  "このセッションでここまでにしたことの要約（セッションの切り替え画面に出る。レポートには描かれない）。" +
  "毎回、前の要約を踏まえてセッション全体を書き直す。中立の文体の日本語で2〜3段落・" +
  `${String(MAX_SESSION_SUMMARY_LENGTH)}字以内、段落は空行で区切る。` +
  "残っていることがあれば最後の段落を「残り：」で始める。"

/**
 * `Stop` の関所が差し戻すときにモデルへ返す理由。
 * 固定の文面だけで、モデルが書いた本文は写さない（会話の中身をモデルの文脈へ戻す経路を作らない）。
 * 差し戻しは利用者の画面に出ないので、セリフで触れさせない（触れると利用者には意味の通らない言い訳になる）。
 */
export const REPORT_GATE_REASON =
  "いま書いた本文は画面に出ていない。その内容を `report` ツール（`mcp__tsukumo__report`）で" +
  "渡し直すこと。締めの一言は `report` の closing に入れる（`report` が通るとそこでターンが終わる）。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/**
 * `Stop` の関所。
 * 届いたイベントを {@link ReportGate.observe} で見て、SDK のターンの頭から書いた本文を覚えておき、止まろうとしたときに {@link ReportGate.verdict} が差し戻すか（と、その理由）を決める。
 * `report` が届いたら覚えた本文を捨てる（通った `report` はターンを閉じるので、そのターンの本文は `report` の前に書いたものだけ）。
 *
 * - ターンの頭は `session-info`（`init` は SDK のターンの頭に毎回届く。依頼で始まるターンも、背景のタスクやサブエージェントの合図で claude が自分で始めるターンも同じ）。`turn-finished` でも空に戻す（`init` が来ない経路があっても前のターンの本文を持ち越さない）
 * - 本文は `utterance` だけを数える（書きかけの断片は、同じ本文が `utterance` で届き直す）
 * - 呼ぶ側はサブエージェントの中の本文を渡さない（画面に出すかの判断はメインの本文で決まる）
 */
export type ReportGate = {
  readonly observe: (event: SessionEvent) => void
  /**
   * 差し戻すか。`stopHookActive`（すでに一度差し戻して続けているところ）なら差し戻さない（ループさせない）。
   * それ以外は、覚えた本文が1行を超えていれば差し戻す。
   */
  readonly verdict: (stopHookActive: boolean) => ReportGateVerdict
}

/** 関所の判定。差し戻すときはモデルへ返す理由を持つ。 */
export type ReportGateVerdict =
  | { readonly kind: "pass" }
  | { readonly kind: "block"; readonly reason: string }

/**
 * {@link ReportGate} を1つ作る。セッション1つに1つ（ターンの区切りを自分で見ている）。
 * `nothingNewRejected` が true を返すターンは、`ReportReview.judge` が「新しい事実が無い」で
 * `report` を差し戻している。渡し直す本文は無いので、本文の量によらず通す。
 */
export function createReportGate(nothingNewRejected: () => boolean): ReportGate {
  let unreported: readonly string[] = []

  return {
    observe: (event) => {
      unreported = nextUnreported(unreported, event)
    },
    verdict: (stopHookActive) =>
      stopHookActive || nothingNewRejected() || !exceedsOneLine(unreported)
        ? { kind: "pass" }
        : { kind: "block", reason: REPORT_GATE_REASON },
  }
}

/**
 * 「1行」の字数の上限（コードポイントで数える）。
 * 改行を含まなくても、これを超えたら1行と見なさない（改行の無い段落1つでレポートを書き切ることがあるため）。
 * 試行で通ってよかった1行（背景の委譲を待つ一言など）は64字以下、差し戻すべきだった本文は131字以上だった（`docs/research/report-tool-trial.md`）。その間に余裕を取って置く。
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
