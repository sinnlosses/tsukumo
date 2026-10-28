// `report` ツールまわりの決まりごと。仕事のセッションではレポートを常にこのツールで受け取り、雑談のときは載せない（雑談は本文を書かない）。
//
// ここに置くのは、ツールの説明文と `Stop` フックの関所（`createReportGate`）。
// 通った `report` はそこでターンを閉じる（handler が結果に `claude/endTurn` を付ける）ので、`report` のあとに本文が書かれることは無い。
// 関所が止めるのは、背景の仕事が走っていないのに `report` を呼ばずに本文を書いて止まろうとしたターンだけで、`report` で渡し直させる。
// `report` の呼び出しそのものの検査と差し戻しは `ReportReview` が持つ。

import { MAX_SESSION_HEADING_LENGTH } from "../../../shared/session/session-choice.ts"
import type { FigurePreference } from "../../../shared/session/session-default.ts"
import { MAX_SESSION_SUMMARY_LENGTH } from "../../../shared/session/session-digest.ts"
import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { REPORT_CALL_EXAMPLES_TEXT } from "./call-example.ts"

/**
 * モデルに見せる `report` ツールの説明。記法の条はここに書かず、規約の節を1行で指す。
 * MCP ツールの説明文は既定で 2048 字までしか渡らず、規約の全文は入らない。
 */
export const REPORT_TOOL_DESCRIPTION =
  "ターンのレポートをメインビューに出す。task（目録の1行と見出し）→ conclusion → keyFigures（数のカード）→ checks（検証結果の表）→ figure → sections → retrospective → favor の順に描かれ、" +
  "そのあと closing のセリフが吹き出しに出る。受け付けられるとそこでターンが終わる（あとに何も書けない）。" +
  "差し戻されたら、直す項目だけを渡して呼び直せばよい（渡さなかった項目は、同じターンで直前に差し戻した呼び出しの値を引き継ぐ）。" +
  "書き方は「レポートの記法（tsukumo）」の節に従う。" +
  "本文は日本語で書く（識別子・パス・コマンド・コードは英語のままでよい）。\n" +
  REPORT_CALL_EXAMPLES_TEXT

/**
 * `report` の任意の `checks` 引数の説明。
 * 結果を `conclusion` と `sections` に書かない条は `REPORT_NOTATION_PROMPT` の「結論は `conclusion` に1〜2文で書く」が持つ。
 */
export const REPORT_CHECKS_DESCRIPTION =
  "検証の結果。結論の下に総括行と、落ちた・確かめていない項目の行で描かれ、通った項目は畳む。" +
  "検証をしていないターンでは省く。結果の数は figure に、打ったコマンドは command に分ける。" +
  "label・figure・detail・howToVerify は素の文字で描かれるので、記法を使わない。"

/**
 * `report` の任意の `retrospective` 引数の説明。
 * どのワークフローの段かは見ず、欄があるときだけ描く。欠けても差し戻さない。
 */
export const REPORT_RETROSPECTIVE_DESCRIPTION =
  "振り返りの段があったときだけ、その結果を渡す（sections に混ぜない。見出し「振り返り」の節として最後に描く）。"

/**
 * `report` の任意の `task` 引数の説明。`conclusion` との書き分けと、報告の種類ごとの既定の節の並びはここだけが持つ。
 */
export const REPORT_TASK_DESCRIPTION =
  "タスクの作業のレポートのときだけ渡す（タスクID・作業の名前・終わり方・種類）。結論の上に目録の1行と作業の名前の見出しが描かれる。" +
  "渡したら conclusion に作業の名前やタスクID、変更の量（tsukumo が git から数える）を書かない。" +
  "genre を入れると、sections の節をその種類の既定の並びで書く（節の数は縛らない）。" +
  "work: 変化 → 証拠 → 変更の要所 → 限界と変えていないもの → お願い。" +
  "decision: 決めたこと → 理由と採らなかった案（options）→ 結果 → 未決。" +
  "research: 分かったこと → 根拠（出典か path:line）→ 何を意味するか → 確かめていないこと（claims）→ 次。" +
  "status は research、diagnosis・timeline・structure・screen は work の並び。" +
  "stopped は種類によらず: どこで止まったか → 原因 → 残したものと戻したもの → 再開に要るもの（favor）。" +
  "genre を省くと並びは縛らない。タスクに紐付かないターンでは task を省く。"

/** `report` の任意の `workPlanClosing` 引数（段の閉じ方）の説明。 */
export const REPORT_WORK_PLAN_CLOSING_DESCRIPTION =
  "段の閉じ方。同じ依頼で work_plan を渡したときは必ず入れる。" +
  "finished（全部の段を終えた。最後の段にいるときに渡すと tsukumo が帯を全部済みにする）/ " +
  "stopped（途中で止めた。帯は今の段のまま残る）。ワークプランの無い依頼では省く。"

/**
 * `report` の `figure` 引数（レポートの図1つか、置かない理由）の説明。
 * 図を置く条件と作業のレポートの最小形はここだけが持つ。図の塊ごとの使いどころは各塊の `describe` が持つ。
 */
export function reportFigureDescription(preference: FigurePreference): string {
  const head =
    "レポートの図1つ。checks の下・sections の上に「図 1」として描かれ、sections の図の番号はそのあとに続く。"
  const parts =
    "図の部品（image / mermaid / graph / svg / timeline / beforeAfter / chart / stats / plot）"
  const conditions =
    "名前が3つ以上出てきてつながる・流れや分岐がある・構造の前後がある・数が3つ以上ある"
  if (preference === "text") {
    return (
      `${head}利用者は文を主に読む設定なので、次のどれかがある節がなければ図は置かない（figure を省く。省くと何も描かれない）: ${conditions}。` +
      `ある節には${parts}を置いてよい。`
    )
  }
  return (
    `${head}次のどれかがあれば${parts}を置く: ${conditions}。` +
    "作業のレポートの最小の形は、ここに図1つと、sections に表か箇条書き。" +
    "どれにも当たらないときは figure を省く（省くと何も描かれない）。"
  )
}

/** `report` の任意の `keyFigures` 引数（結論の直下に並べる数）の説明。使いどころの条は `REPORT_NOTATION_PROMPT` が持つ。 */
export const REPORT_KEY_FIGURES_DESCRIPTION =
  "結論に効く数を3〜4個（件数・割合・前後の差）。結論の直下にカードで並ぶ。" +
  "3つに満たなければ省いて結論の文に入れる。項目の形は stats の items と同じ。"

/**
 * `report` の任意の `sections` 引数（本文。節と塊の並び）の説明。
 * 塊の種類ごとの使いどころは各塊の `describe`（`reportBlockSchema`）が持つので、ここに書かない。
 */
export const REPORT_SECTIONS_DESCRIPTION =
  "結論のあとの根拠・比較・手順。節の並びで、節ごとに部品を並べる。" +
  "部品の文字で効くのはインラインの記法（inline code・太字・リンク）だけ。" +
  "部品の fold に見出しを書くと畳んで描く（畳んでも結論が通る部品だけ）。" +
  "部品の aside に出典・どこを見るかを1行で書くと、本文の流れの外（本文の右の余白）に置く。" +
  "結論と checks に書いたことは節で繰り返さず、根拠と中身だけを置く。"

/**
 * `report` の任意の `body` 引数（`body-fence` の版の本文）の説明。
 * フェンスは info string の語で種類を言い、中身は既存の記法を使う。読めないフェンスは差し戻さず、素のコードブロックに描く。
 */
export const REPORT_BODY_DESCRIPTION =
  "結論のあとの本文。Markdown 1つで書く（見出しは ##）。sections と同じ呼び出しに併記できない。" +
  "図・表・コード・注記・主張・画像だけ、言語名の代わりに種類を書いたフェンスで書く。" +
  "figure: question:（読者がこの図で決めること）・relation:（compare / rank / part / trend / change / distribution / correlate / range）・unit:（値の単位）・data:（次の行から字下げして `名前: 数`）。" +
  "graph: 1行1矢印の `A -> B: 語`。" +
  "mermaid: sequenceDiagram か stateDiagram-v2 のソース。" +
  "table: 開きの行の語の後ろに表の題、中身は `| 列 | 列 |` の表。" +
  "code: 開きの行は `code 言語 [パス]`。" +
  "callout: 開きの行は `callout 種別`（info / warn / ng / ask / memo）、中身は一文。" +
  "claims: 1行1主張 `確度 | 主張 | 根拠 | 確かめ方`（確度は confirmed / inferred / unverified）。" +
  "image: 開きの行は `image 何が見えるか`、中身の1行目が画像のパス、2行目からが見る場所。"

/** `a2ui` の版の `components` 引数（A2UI のカタログの部品の平らな一覧）の説明。 */
export const REPORT_A2UI_COMPONENTS_DESCRIPTION =
  "レポートを A2UI の部品の平らな一覧で書く。根は id が root の Report で、結論ほかの欄は Report の props に書き、Report.children に Section の ID を並べる。" +
  "Section.children は葉か配置の部品（Row・Column・Card・Tabs・ChoicePicker）の ID、図は Report.figure に図の部品の ID を置く。呼び直すときも一覧を全部渡す。"

/** `body-fence` の版で、部品の型の表記の代わりに `figure` と `sections` の説明の後ろに足す文。 */
export const REPORT_PART_CARD_NOTE = "部品の型と例は report_part_card で種類を渡して引く。"

/** 短い型の表記で渡す版で、`figure` の説明の後ろに足す文。 */
export const REPORT_FIGURE_SHORT_TYPE_NOTE = "型は sections の説明の ReportFigure。"

/** 短い型の表記で渡す版で、`sections` の説明と型の表記の間に置く見出し。 */
export const REPORT_SECTIONS_SHORT_TYPE_HEADING =
  "各節の型は ReportSection（TypeScript の表記。? の欄は省ける）:"

/**
 * `report` の `closing` 引数（締めのセリフ）の説明。
 * `report` はターンを閉じるので、締めの一言はあとから `speak` で言えず、ここで受け取る。
 * 何を言うかは `REPORT_NOTATION_PROMPT` が持つ。
 */
export const REPORT_CLOSING_DESCRIPTION =
  "締めのセリフ（speak と同じ text と expression）。レポートを描いたあとに吹き出しに出る。" +
  "レポートの中身を言い直さない。"

/**
 * `report` の `waitingLine` 引数（待ちの一言）の説明。
 * 出す時刻と回数は tsukumo が決める（`waitingLineDueAt`）ので、ここでは何を言うかだけを言う。
 */
export const REPORT_WAITING_LINE_DESCRIPTION =
  "待ちの一言（speak と同じ text と expression）。利用者が次の依頼を送らないまましばらく経ったら、吹き出しに1回だけ出る。" +
  "次の依頼を待っていることを言う一言にし、closing とレポートの中身を言い直さない。" +
  "言いたい一言があるときだけ書く。省くと書かせた待ちの行、それも無ければ tsukumo の既定の1文が出る。"

/**
 * `report` の任意の `title` 引数の説明。セッション一覧の見出しにする題を付けさせる条はここだけ。
 * 利用者の `/rename` を上書きしない判断はモデルに任せず、`decideSessionTitle` が持つ。
 */
export const REPORT_TITLE_DESCRIPTION =
  `セッション一覧の見出しにする短い題（${String(MAX_SESSION_HEADING_LENGTH)}字以内）。` +
  "セッションの中心の話題が変わったときだけ新しい題を渡し、変わっていなければ省く。" +
  "/clear のあとの新しいセッションには前の題が残っていることがあるので、要約の中心と違うなら付け直す。"

/**
 * `report` の `sessionSummary` 引数の説明。
 * 切り替え画面に出すセッション全体の要約の書き方はここだけが持つ。
 * 書いた値は transcript の `report` の入力に残り、切り替え画面はそれを読み戻す（tsukumo は別の場所へ書き出さない）。
 */
export const REPORT_SESSION_SUMMARY_DESCRIPTION =
  "このセッションでここまでにしたことの要約（セッションの切り替え画面に出る。レポートには描かれない）。" +
  "変えたいときだけ、前の要約を踏まえて全体を書く。一度も書かないうちは、省くと直近5ターンの結論の1文目の箇条が要約になる。" +
  `書くなら中立の文体の日本語で2〜3段落・${String(MAX_SESSION_SUMMARY_LENGTH)}字以内、段落は空行で区切る。` +
  "残っていることは要約に書かず sessionRemaining に書く。"

/** `report` の `sessionRemaining` 引数の説明。 */
export const REPORT_SESSION_REMAINING_DESCRIPTION =
  "このセッションで残っていること（次のセッションで続ける作業）を1〜2文で。書き出しに「残り：」は付けない。" +
  "始め方の一覧の「前回の続き」の札の題と、次のセッションへ送る依頼の文になる。" +
  "残っていることが無ければ空の文字列にする。task.outcome が finished のときだけ省ける（finished 以外では必須）。"

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
 * - ターンの頭は `session-info`（`init` は SDK のターンの頭に毎回届く。依頼で始まるターンも、バックグラウンドタスクやサブエージェントの合図で claude が自分で始めるターンも同じ）。`turn-finished` でも空に戻す（`init` が来ない経路があっても前のターンの本文を持ち越さない）
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

  return {
    observe: (event) => {
      unreported = nextUnreported(unreported, event)
    },
    verdict: (stopHookActive) =>
      stopHookActive || nothingNewRejected() || backgroundRunning() || !hasText(unreported)
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
