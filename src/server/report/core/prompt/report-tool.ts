// `report` ツールまわりの決まりごと。仕事のセッションではレポートを常にこのツールで受け取り、雑談のときは載せない（雑談は本文を書かない）。
//
// ここに置くのは、ツールの説明文と `Stop` フックの関所（`createReportGate`）。
// 通った `report` はそこでターンを閉じる（handler が結果に `claude/endTurn` を付ける）ので、`report` のあとに本文が書かれることは無い。
// 関所が止めるのは、背景の仕事が走っていないのに `report` を呼ばずに本文を書いて止まろうとしたターンだけで、`report` で渡し直させる。
// `report` の呼び出しそのものの検査と差し戻しは `ReportReview` が持つ。

import { MAX_SESSION_HEADING_LENGTH } from "../../../../shared/session/session-choice.ts"
import type { FigurePreference } from "../../../../shared/session/session-default.ts"
import { MAX_SESSION_SUMMARY_LENGTH } from "../../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import { PART_CARD_TOOL_NAME } from "../../../core/tsukumo-tool-name.ts"
import { INITIAL_ASIDE_TURN, nextAsideTurn } from "../aside/aside-turn.ts"

/**
 * モデルに見せる `report` ツールの説明。記法の条はここに書かず、規約の節を1行で指す。
 * MCP ツールの説明文は既定で 2048 字までしか渡らず、規約の全文は入らない。
 */
export const REPORT_TOOL_DESCRIPTION =
  "ターンのレポートをメインビューに出す。task → conclusion → keyFigures → checks → figure → sections → retrospective → favor の順に描き、" +
  "そのあと closing のセリフが吹き出しに出る。" +
  "差し戻しのあとで省いた Report の欄は、同じターンの直前の呼び出しの値を引き継ぐ。" +
  "書き方は「レポートの記法（tsukumo）」の節に従う。" +
  "本文は日本語で書く（識別子・パス・コマンド・コードは英語のままでよい）。\n" +
  `部品（Report・Section を含む）の欄の細かい書き方と例は ${PART_CARD_TOOL_NAME} のカードにだけ載る。` +
  "このセッションで初めて使う部品は、置く前に部品の名前を渡してカードを引く。"

/**
 * `report` の定義に載せる `Report` の欄の説明。毎ターン文脈に入るので、書き損じると差し戻しが増える条だけを短く持つ。
 * 細かい書き方は `REPORT_FIELD_CARD_NOTES` に置き、`Report` の部品カードにだけ載せる。
 * 結果を `conclusion` と `sections` に書かない条は `REPORT_NOTATION_PROMPT` の「結論は `conclusion` に1〜2文で書く」が持つ。
 * `report` はターンを閉じるので、締めの一言はあとから `speak` で言えず、`closing` で受け取る。
 */
export const REPORT_FIELD_DESCRIPTIONS = {
  task: "タスクの作業のときだけ渡す。渡したら conclusion に作業の名前・タスクID・変更の量を書かない",
  retrospective: "振り返りの結果。sections に混ぜない",
  notDone: "task のとき、手を付けなかったことを並べる。無ければ空の並び",
  favor: "利用者が取る行動が残るときだけ1つ。取る手段まで書く",
  favorOptions: "お願いの選択肢（3つまで）。favor があるときだけ",
  checks: "検証の結果。検証していないターンでは省く。文字に記法を使わない",
  sources: "主張を裏づける外の文書。本文の {{cite: id}} で指すときだけ",
  terms: "読み手が知らない外の用語の注。本文に出る字で、1文で書く。付けるときだけ",
  title: `セッション一覧の題（${String(MAX_SESSION_HEADING_LENGTH)}字以内）。話題が変わったときだけ`,
  sessionSummary: `セッション全体の要約。変えたいときだけ（${String(MAX_SESSION_SUMMARY_LENGTH)}字以内）`,
  sessionRemaining: "残っている作業を1〜2文で。無ければ空文字",
  continueRequest: "続きの依頼の文（〜して の形）。sessionRemaining と一緒に、続きがあるときだけ",
  nextSteps:
    "このレポートを読んだ利用者が次に頼むと助けになる依頼（3つまで）。入力欄の上に札で出る。無ければ省く",
  closing: "締めのセリフ（1〜2文）。レポートのどこから読むとよいかを言い、中身は言い直さない",
  waitingLine: "待ちの一言（1〜2文）。次の一手の候補を言う。言いたいときだけ",
} as const

/**
 * `report` の `figure` 引数（レポートの図1つか、置かない理由）の説明。
 * 図を置く条件はここだけが持つ。描かれる位置と作業のレポートの最小形は `REPORT_FIELD_CARD_NOTES` が持つ。
 * 図の部品ごとの使いどころは部品カード（`partCardOf`）が持つ。
 */
export function reportFigureDescription(preference: FigurePreference): string {
  const head = "図1つ（図の部品の ID。同じ部品を節には置かない）。"
  const parts = "図の部品（image・mermaid・graph・svg・timeline・compare・chart・stats・plot）"
  const notFigure = "表（Table）・箇条書きは図の部品ではないので、節に置く。"
  const conditions =
    "名前が3つ以上出てきてつながる・流れや分岐がある・構造の前後がある・数が3つ以上ある"
  if (preference === "text") {
    return (
      `${head}利用者は文を主に読む設定なので、次のどれかがあるセクションがなければ図は置かない（figure を省く。省くと何も描かれない）: ${conditions}。` +
      `あるセクションには${parts}を置いてよい。${notFigure}`
    )
  }
  return `${head}次のどれかがあれば${parts}を置く: ${conditions}。無ければ省く。${notFigure}`
}

/**
 * `report` の `Section` の部品の説明。
 * 部品の種類ごとの使いどころは部品カード（`partCardOf`）が持つので、ここに書かない。
 */
export const REPORT_SECTIONS_DESCRIPTION =
  "結論のあとの根拠・比較・手順。部品の文字で効くのはインラインの記法だけ"

/** `a2ui` の版の `components` 引数（A2UI のカタログの部品の平らな一覧）の説明。 */
export const REPORT_A2UI_COMPONENTS_DESCRIPTION =
  "レポートを A2UI の部品の平らな一覧で書く。根は id が root の Report で、結論ほかの欄は Report の props に書き、children に Section の ID を並べる。" +
  "Section.children は内容部品か配置の部品の ID。呼び直すときも一覧を全部渡す。"

/**
 * `Stop` の関所が差し戻すときにモデルへ返す理由。
 * 固定の文面だけで、モデルが書いた本文は写さない（会話の中身をモデルの文脈へ戻す経路を作らない）。
 * 差し戻しは利用者の画面に出ないので、セリフで触れさせない（触れると利用者には意味の通らない言い訳になる）。
 */
const REPORT_GATE_REASON =
  "いま書いた本文は画面に出ていない。その内容を `report` ツール（`mcp__tsukumo__report`）で" +
  "渡し直すこと。締めの一言は `report` の closing に入れる（`report` が通るとそこでターンが終わる）。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"

/**
 * `Stop` の関所。
 * 届いたイベントを {@link ReportGate.observe} で見て、SDK のターンの頭から書いた本文を覚えておき、止まろうとしたときに {@link ReportGate.verdict} が差し戻すか（と、その理由）を決める。
 * `report` が届いたら覚えた本文を捨てる（通った `report` はターンを閉じるので、そのターンの本文は `report` の前に書いたものだけ）。
 *
 * - ターンの頭は `session-info`（`init` は SDK のターンの頭に毎回届く。依頼で始まるターンも、バックグラウンドタスクやサブエージェントの通知で claude が自分で始めるターンも同じ）。`turn-finished` でも空に戻す（`init` が来ない経路があっても前のターンの本文を持ち越さない）
 * - 本文は `utterance` だけを数える（書きかけの断片は、同じ本文が `utterance` で届き直す）
 * - 呼ぶ側はサブエージェントの中の本文を渡さない（画面に出すかの判断はメインの本文で決まる）
 */
export type ReportGate = {
  readonly observe: (event: SessionEvent) => void
  /**
   * 差し戻すか。`stopHookActive`（すでに一度差し戻して続けているところ）なら差し戻さない（ループさせない）。
   * それ以外は、背景の仕事が走っておらず、覚えた本文が1字でもあれば差し戻す。
   */
  readonly verdict: (stopHookActive: boolean) => ReportGateVerdict
}

/** 関所の判定。差し戻すときはモデルへ返す理由を持つ。 */
export type ReportGateVerdict =
  | { readonly kind: "pass" }
  | { readonly kind: "block"; readonly reason: string }

/**
 * {@link ReportGate} を1つ作る。セッション1つに1つ（ターンの区切りを自分で見ている）。
 * `nothingNewRejected` が true を返すターンは、`CallReview.judgeReport` が「新しい事実が無い」で
 * `report` を差し戻している。渡し直す本文は無いので、本文の量によらず通す。
 * `backgroundRunning` が true を返すあいだは、背景の仕事（シェル・サブエージェントなど種類を問わない）の終わりを待つ一言を書いて止まるので、通す。
 */
export function createReportGate(
  nothingNewRejected: () => boolean,
  backgroundRunning: () => boolean,
): ReportGate {
  let unreported: readonly string[] = []
  let asideTurn = INITIAL_ASIDE_TURN

  return {
    observe: (event) => {
      unreported = nextUnreported(unreported, event)
      asideTurn = nextAsideTurn(asideTurn, event)
    },
    verdict: (stopHookActive) =>
      stopHookActive ||
      nothingNewRejected() ||
      backgroundRunning() ||
      asideTurn.aside ||
      !hasText(unreported)
        ? { kind: "pass" }
        : { kind: "block", reason: REPORT_GATE_REASON },
  }
}

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

/** 本文の並びに空白でない字が1字でもあるか。 */
function hasText(texts: readonly string[]): boolean {
  return texts.some((text) => text.trim() !== "")
}
