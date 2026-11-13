// `Report` の欄の細かい書き方。`Report` の部品カードにだけ、`REPORT_FIELD_DESCRIPTIONS` のあとに載る。

import type { REPORT_FIELD_DESCRIPTIONS } from "./report-tool.ts"

/**
 * 報告の種類ごとの既定の節の並び（`task`）と、利用者へのお願いの書き方（`favor`）はここだけが持つ。
 * 古い欄（`task.outcome`・`favor`・`workPlanClosing`）と新しい欄（`verdict`・`next`）の関係もここだけが書き手に伝える。
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
    "stopped（途中で止めた。プログレスバーは今のフェーズのまま残る）。ワークプランの無い依頼では省く。" +
    "verdict を書いたなら省ける（done・partial は finished、ほかは stopped として読む）。",
  keyFigures:
    "結論に効く数（件数・割合・前後の差）を3〜4個、結論の直下にカードで並べる。3つに満たなければ省いて結論の文に入れる。" +
    "項目の形と欄の書き方は Stats の items と同じ（Stats のカードに載る）。目標があれば target と better、差は targetGap。",
  figure:
    "checks の下・sections の上に「図 1」として描かれ、sections の図の番号はそのあとに続く。" +
    "作業のレポートの最小の形は、ここに図1つと、sections に表か箇条書き。",
  retrospective:
    "振り返りのフェーズがあったときだけ渡す。見出し「振り返り」のセクションとして最後に描く。",
  favor:
    "行動は作業を終えた・止めたあとに残る、書き手が代わりにできないことに限る（2件あってもまとめる）。報告・感想・提案は書かず、行動が無ければ省く。" +
    "打つコマンドはそのコマンドを inline code で、開く場所・押す操作は場所と名前を書く。" +
    "順番があるときは「1. …　2. …」と番号を振って順に並べる。" +
    "next を書いたなら省ける（favor は owner が you の next として読む）。",
  checks:
    "結論の下に総括行と、落ちた・確かめていない項目の行で描かれ、通った項目は畳む。" +
    "結果の数は figure に、打ったコマンドは command に分ける。" +
    "label・figure・detail・howToVerify は素の文字で描かれる。",
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
  closing: "speak と同じ text と expression。レポートを描いたあとに吹き出しに出る。",
  waitingLine:
    "speak と同じ text と expression。利用者が次の依頼を送らないまましばらく経ったら、吹き出しに1回だけ出る。" +
    "次の依頼を待っていることを言う一言にし、closing とレポートの中身を言い直さない。" +
    "省くと書かせた待ちの行、それも無ければ tsukumo の既定の1文が出る。",
  verdict:
    "紙の頭の判定の行になる。done（済んだ）/ partial（一部済んだ）/ yours（利用者の答えか操作を待つ）/ " +
    "stopped（自分で止めた）/ failed（検証が落ちるなどして止まった）。" +
    "書けば task.outcome と workPlanClosing は省ける。両方書くなら食い違わせない。checks に ng の行があるなら done にしない。",
  next:
    "判定の行の直後に描く。owner は you（利用者が動く）・writer（書き手が続ける）・none（誰も動かない）。" +
    "action は取る手段まで含めた1文。choices は利用者が選べる答えの短い語を3つまで（4つ目からは描かない）。",
  assumptions:
    "本文の「置いた前提」に描く。1要素1文で、なぜその前提を置いたかを含める。確かめた事実は書かない。",
  sources:
    "mark は 1 から始まる番号、place は path:line か一次情報の名前、note は省ける1行。" +
    "本文の文末に {{src: n}} を置くと番号が付き、同じ高さの欄外に出どころが出る。本文で使う番号と mark をそろえる。",
  previous:
    "このセッションで前に report を出したときだけ書く。resolved（前回から直ったこと）・added（新しく出たこと）・" +
    "remaining（残っていること）を、それぞれ短い文の配列で。結論の直後に描く。",
  guideNotes:
    "target は部品の id か Report の欄の名前（checks・conclusion など）、text はキャラクターの口調の1文。" +
    "指した所の横の欄外に描く。",
} as const satisfies Record<
  keyof typeof REPORT_FIELD_DESCRIPTIONS | "figure" | "workPlanClosing" | "keyFigures",
  string
>
