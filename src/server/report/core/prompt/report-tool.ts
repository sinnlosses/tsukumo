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
 * 細かい書き方は {@link REPORT_FIELD_CARD_NOTES} に置き、`Report` の部品カードにだけ載せる。
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
  title: `セッション一覧の題（${String(MAX_SESSION_HEADING_LENGTH)}字以内）。話題が変わったときだけ`,
  sessionSummary: `セッション全体の要約。変えたいときだけ（${String(MAX_SESSION_SUMMARY_LENGTH)}字以内）`,
  sessionRemaining: "残っている作業を1〜2文で。無ければ空文字",
  continueRequest: "続きの依頼の文（〜して の形）。sessionRemaining と一緒に、続きがあるときだけ",
  closing: "締めのセリフ（1〜2文）。レポートのどこから読むとよいかを言い、中身は言い直さない",
  waitingLine: "待ちの一言（1〜2文）。次の一手の候補を言う。言いたいときだけ",
} as const

/**
 * `Report` の欄の細かい書き方。`Report` の部品カードにだけ、{@link REPORT_FIELD_DESCRIPTIONS} のあとに載る。
 * 報告の種類ごとの既定の節の並び（`task`）と、利用者へのお願いの書き方（`favor`）はここだけが持つ。
 * `retrospective` はどのワークフローのフェーズかは見ず、欄があるときだけ描く。
 * `waitingLine` を出す時刻と回数は tsukumo が決める（`waitingLineDueAt`）ので、ここでは何を言うかだけを言う。
 * `title` で利用者の `/rename` を上書きしない判断はモデルに任せず、`decideSessionTitle` が持つ。
 * `sessionSummary` の値は transcript の `report` の入力に残り、切り替え画面はそれを読み戻す（tsukumo は別の場所へ書き出さない）。
 */
export const REPORT_FIELD_CARD_NOTES = {
  task:
    "タスクID・作業の名前・終わり方・種類を渡すと、結論の上にタスク見出し行と作業の名前の見出しが描かれる（変更の量は tsukumo が git から数える）。" +
    "genre を入れると、sections のセクションをその種類の既定の並びで書く（セクションの数は縛らない）。" +
    "work: 変化 → 証拠 → 変更の要所 → 限界と変えていないもの → お願い。" +
    "decision: 決めたこと → 理由と採らなかった案（options）→ 結果 → 未決。" +
    "research: 分かったこと → 根拠（出典か path:line）→ 何を意味するか → 確かめていないこと（claims）→ 次。" +
    "status は research、diagnosis・timeline・structure・screen は work の並び。" +
    "stopped は種類によらず: どこで止まったか → 原因 → 残したものと戻したもの → 再開に要るもの（favor）。" +
    "genre を省くと並びは縛らない。タスクに紐付かないターンでは task を省く。",
  workPlanClosing:
    "フェーズの閉じ方。同じ依頼で work_plan を渡したときは必ず入れる。" +
    "finished（全部終えた。最後のフェーズにいるときに渡すと tsukumo がプログレスバーを全部済みにする）/ " +
    "stopped（途中で止めた。プログレスバーは今のフェーズのまま残る）。ワークプランの無い依頼では省く。",
  keyFigures:
    "結論に効く数（件数・割合・前後の差）を3〜4個、結論の直下にカードで並べる。3つに満たなければ省いて結論の文に入れる。" +
    "項目の形と欄の書き方は Stats の items と同じ（Stats のカードに載る）。目標があれば target と better、差は targetGap。",
  figure:
    "checks の下・sections の上に「図 1」として描かれ、sections の図の番号はそのあとに続く。" +
    "作業のレポートの最小の形は、ここに図1つと、sections に表か箇条書き。" +
    "主の図は種類で決まる: 画面は前後の画、数は前後を重ねた chart、構造は前後の構成図、不具合は前後と原因の流れ、案の比較は今と採ったあとの compare、" +
    "調べものと時間の順は分かったことの図1枚、止めたときは狙いと今、戻せない操作の前は今としたあと。" +
    "対の見出しは題材に合わせて読み替える（今｜採ったあと、狙い｜今、今｜したあと。compare の heading）。" +
    "調べものや短い答えのように対にならない題材は、無理に対へ寄せない。",
  retrospective:
    "振り返りのフェーズがあったときだけ渡す。見出し「振り返り」のセクションとして最後に描く。",
  notDone:
    "task を渡すときは必ず渡す。タスクで手を付けなかったことを1要素1件で並べ、無ければ空の並びを渡す（省くのは「無い」とは言わず黙ること）。",
  favor:
    "行動は作業を終えた・止めたあとに残る、書き手が代わりにできないことに限る（2件あってもまとめる）。報告・感想・提案は書かず、行動が無ければ省く。" +
    "打つコマンドはそのコマンドを inline code で、開く場所・押す操作は場所と名前を書く。" +
    "順番があるときは「1. …　2. …」と番号を振って順に並べる。",
  favorOptions:
    "利用者が選ぶ案を札で並べる。draft は利用者が送る文の形で書く。result は選ぶと何が起きるかを短く言う。" +
    "戻せない操作を含む案は irreversible を付け、わけは favor の本文に書く。recommended は1つまで。favor が無ければ渡さない。",
  checks:
    "結論の下に総括行と、落ちた・確かめていない項目の行で描かれ、通った項目は畳む。" +
    "結果の数は figure に、打ったコマンドは command に分ける。" +
    "label・figure・detail・howToVerify は素の文字で描かれる。" +
    "supports には、その行が裏づける節（Section）の id を並べる。",
  title:
    "セッションの中心の話題が変わったときだけ新しい題を渡し、変わっていなければ省く。" +
    "/clear のあとの新しいセッションには前の題が残っていることがあるので、要約の中心と違うなら付け直す。",
  sessionSummary:
    "このセッションでここまでにしたことの要約で、セッションの切り替え画面に出る（レポートには描かれない）。" +
    "変えたいときだけ、前の要約を踏まえて全体を書く。一度も書かないうちは、省くと直近5ターンの結論の1文目の箇条が要約になる。" +
    "書くなら中立の文体の日本語で2〜3段落、段落は空行で区切る。残っていることは要約に書かず sessionRemaining に書く。",
  sessionRemaining:
    "次のセッションで続ける作業を書く。書き出しに「残り：」は付けない。" +
    "始め方の一覧の「前回の続き」のカードの題と、次のセッションへ送る依頼の文になる。",
  continueRequest:
    "「続ける」を押すと利用者の入力欄へそのまま入る。利用者がそのまま送る依頼の文（〜して の形）で書く。",
  closing:
    "speak と同じ text と expression。レポートを描いたあとに吹き出しに出る。" +
    "レポートのどこから読むとよいかを言う。",
  waitingLine:
    "speak と同じ text と expression。利用者が次の依頼を送らないまましばらく経ったら、吹き出しに1回だけ出る。" +
    "次の一手の候補を言う一言にし（いまの様子があればそれも）、closing とレポートの中身を言い直さない。" +
    "省くと書かせた待ちの行、それも無ければ tsukumo の既定の1文が出る。",
} as const satisfies Record<
  keyof typeof REPORT_FIELD_DESCRIPTIONS | "figure" | "workPlanClosing" | "keyFigures",
  string
>

/**
 * `report` の `figure` 引数（レポートの図1つか、置かない理由）の説明。
 * 図を置く条件はここだけが持つ。描かれる位置と作業のレポートの最小形は {@link REPORT_FIELD_CARD_NOTES} が持つ。
 * 図の部品ごとの使いどころは部品カード（`partCardOf`）が持つ。
 */
export function reportFigureDescription(preference: FigurePreference): string {
  const head = "図1つ（図の部品の ID）。"
  const parts = "図の部品（image・mermaid・graph・svg・timeline・compare・chart・stats・plot）"
  const conditions =
    "名前が3つ以上出てきてつながる・流れや分岐がある・構造の前後がある・数が3つ以上ある"
  if (preference === "text") {
    return (
      `${head}利用者は文を主に読む設定なので、次のどれかがあるセクションがなければ図は置かない（figure を省く。省くと何も描かれない）: ${conditions}。` +
      `あるセクションには${parts}を置いてよい。`
    )
  }
  return `${head}次のどれかがあれば${parts}を置く: ${conditions}。無ければ省く。`
}

/**
 * `report` の `Section` の部品の説明。
 * 部品の種類ごとの使いどころは部品カード（`partCardOf`）が持つので、ここに書かない。
 */
export const REPORT_SECTIONS_DESCRIPTION =
  "結論のあとの根拠・比較・手順。部品の文字で効くのはインラインの記法だけ"

/** `Section` の部品カードにだけ載せる、部品の fold・aside の書き方。 */
export const REPORT_SECTIONS_CARD_NOTE =
  "節は主張の見出し・図・注記（図の直後に2行まで）の順で書き、変えていないことは「変えていないこと」の見出しの節に分ける。" +
  "差が小さい数は棒にせず、Table の前から後のセルで前と後を並べる。" +
  "部品の fold に見出しを書くと畳んで描く（畳んでも結論が通る部品だけ）。" +
  "部品の aside に出典・どこを見るかを1行で書くと、本文の流れの外（本文の右の余白）に置く。"

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
