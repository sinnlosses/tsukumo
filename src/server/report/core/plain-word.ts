// レポートの本文に出さない「わかりにくい語」と、その言い換え先。用語集の表（docs/glossary/plain-word.md）はここから書き直す。

export type PlainWord = {
  readonly spelling: string
  readonly replacement: string
  readonly meaning: string
}

// 長い綴りを先に置く（「再演集」を「再演」より先に見つけ、同じ箇所を二重に数えない）。
export const PLAIN_WORDS = [
  {
    spelling: "再演集",
    replacement: "タスクの再試集",
    meaning: "送り出し済みのタスクを、前後で解かせ直すために凍結して保存したもの",
  },
  {
    spelling: "再演",
    replacement: "タスクの再試",
    meaning:
      "設定や文書を変える前後で、送り出し済みのタスクを本物の claude に解かせ直して結果を比べること",
  },
  {
    spelling: "有界な自律",
    replacement: "承認なし実行の上限",
    meaning:
      "新しい /loop の流れの最後の段階。人の承認なしで自動で動くが、回数と触れる範囲に上限があり、その中に収まる",
  },
  {
    spelling: "辺",
    replacement: "矢印",
    meaning:
      "図の中で、点（ファイルや部品の名前）と点をつなぐ線。「A が B に値を渡す」というつながりを表す",
  },
  {
    spelling: "節点",
    replacement: "箱",
    meaning: "図の中で、ファイルや部品の名前を1つ置く点。矢印の両端になる",
  },
  {
    spelling: "転がして",
    replacement: "スクロールして",
    meaning: "枠に収まらない中身を、枠の中で上下に送って続きを見ること",
  },
  {
    spelling: "窓",
    replacement: "ブラウザの表示サイズ",
    meaning: "tsukumo の画面を開いたブラウザの、中身を描ける領域の幅と高さ（1440x900 など）",
  },
  {
    spelling: "進み具合の帯",
    replacement: "進み具合のプログレスバー",
    meaning: "画面の端に出す、いま計画のどこまで進んだかをフェーズの並びで見せる表示",
  },
  {
    spelling: "ワークプランの帯",
    replacement: "ワークプランのプログレスバー",
    meaning: "画面の端に出す、ワークプランのどこまで進んだかをフェーズの並びで見せる表示",
  },
  {
    spelling: "委譲中の帯",
    replacement: "委譲中のプログレスバー",
    meaning: "委譲先に任せている作業のどこまで進んだかを見せる表示",
  },
  {
    spelling: "傍注",
    replacement: "欄外注",
    meaning: "本文の横の余白の欄に添える、出典やどこを見るかを書いた短い注",
  },
  {
    spelling: "ワークフローの面",
    replacement: "ワークフローの描画領域",
    meaning: "ワークフローの設定を描く、画面の中の領域",
  },
  {
    spelling: "入力欄の面",
    replacement: "入力欄の描画領域",
    meaning: "入力欄を描く、画面の中の領域",
  },
  {
    spelling: "詳細の面",
    replacement: "詳細の描画領域",
    meaning: "詳細を描く、画面の中の領域",
  },
  {
    spelling: "並べた面",
    replacement: "並べた描画領域",
    meaning: "比べるために並べて描いた、画面の中の領域",
  },
  {
    spelling: "振り返りの葉",
    replacement: "振り返りの内容部品",
    meaning:
      "レポートのセクションを組む内容部品（文・表・図など中身を持つ部品）のうち、振り返りを書くもの",
  },
  {
    spelling: "葉の部品",
    replacement: "内容部品",
    meaning:
      "レポートのセクションを組む、文・表・図など中身を持つ部品（配置のための部品は含めない）",
  },
  {
    spelling: "図の葉",
    replacement: "図の内容部品",
    meaning: "内容部品（文・表・図など中身を持つ部品）のうち、図を描くもの",
  },
  {
    spelling: "まとめ待ちの段",
    replacement: "まとめ待ちのフェーズ",
    meaning: "済んだが、まとめ（中間レポートの要約）がまだ届いていないフェーズ",
  },
  {
    spelling: "並列の段",
    replacement: "並列のフェーズ",
    meaning: "同時に走らせる、複数のフェーズのまとまり",
  },
  {
    spelling: "委譲先の段",
    replacement: "委譲先のフェーズ",
    meaning: "委譲先に任せているフェーズ",
  },
  {
    spelling: "段ごとの時間",
    replacement: "フェーズごとの時間",
    meaning: "最終レポートに出す、フェーズごとの所要時間",
  },
  {
    spelling: "段の群",
    replacement: "フェーズのグループ",
    meaning: "並列に走らせる複数のフェーズをまとめたもの",
  },
  {
    spelling: "段の閉じ方",
    replacement: "フェーズの閉じ方",
    meaning: "report でそのターンのフェーズを済ませる・飛ばすことの申告",
  },
  {
    spelling: "レポートの節",
    replacement: "レポートのセクション",
    meaning: "レポートの本文を区切る、見出しと塊の並びを持つ単位",
  },
  {
    spelling: "見出しの無い節",
    replacement: "見出しの無いセクション",
    meaning: "見出しを付けていない、レポートの本文の区切り",
  },
  {
    spelling: "節の塊",
    replacement: "セクションの塊",
    meaning: "レポートの本文の区切りの中に並ぶ、種類の決まった本文の1単位",
  },
  {
    spelling: "節が2つ以上",
    replacement: "セクションが2つ以上",
    meaning: "レポートの本文の区切りが複数あること",
  },
] as const satisfies readonly PlainWord[]
