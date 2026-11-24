// 言い換え表（`PLAIN_WORDS`）のうち、「札」の複合語の行。単独の「札」は登録しない。
// 行の形は `PLAIN_WORDS` の `satisfies` が確かめる（ここから型を読むと import が循環する）。

export const CARD_PLAIN_WORDS = [
  {
    spelling: "プラン使用量の札",
    replacement: "プラン使用量のカード",
    meaning: "契約のプランの使用量を、割合・量・棒で見せる画面の区画",
  },
  {
    spelling: "使用量の札",
    replacement: "使用量のカード",
    meaning: "使用量を割合や量で見せる、画面の四角い区画",
  },
  {
    spelling: "答え待ちの札",
    replacement: "答え待ちのカード",
    meaning: "狭い画面で、答え待ちのあいだ入力欄のすぐ上に固定する、問いと答えのボタンを載せた表示",
  },
  {
    spelling: "おすすめの札",
    replacement: "おすすめのカード",
    meaning: "迎える画面に並べる、おすすめの始め方を1件ずつ載せた表示",
  },
  {
    spelling: "お伺いの札",
    replacement: "お伺いのカード",
    meaning: "許可要求と質問を、番号つきの選択肢で答えられるように載せた表示",
  },
  {
    spelling: "働くあいだの札",
    replacement: "働くあいだのカード",
    meaning: "作業中のメインビューに出す、進み具合・経過・本文を載せた表示",
  },
  {
    spelling: "メインビューの札",
    replacement: "メインビューのカード",
    meaning: "メインビューに出す、やり取りごとの進み具合と本文を載せた表示",
  },
  {
    spelling: "いまの作業の札",
    replacement: "いまの作業のカード",
    meaning: "画面の上端に出す、状態の語・経過・今のフェーズの題を載せた表示",
  },
  {
    spelling: "コンテキストの札",
    replacement: "コンテキストのカード",
    meaning: "コンテキストの使用量の内訳を見せる、画面の四角い区画",
  },
  {
    spelling: "結果の札",
    replacement: "結果のカード",
    meaning: "使用量の見直しの結果を見せる、画面の四角い区画",
  },
  {
    spelling: "提案の札",
    replacement: "提案のカード",
    meaning: "見直しの提案を1件ずつ載せた表示",
  },
  {
    spelling: "始め方の札",
    replacement: "始め方のカード",
    meaning: "始め方の一覧に並ぶ、おすすめや前回の続きを1件ずつ載せた表示",
  },
  {
    spelling: "数の札",
    replacement: "数のカード",
    meaning: "レポートの結論の下などに、大事な数を1つずつ載せて並べる表示",
  },
  {
    spelling: "浮かぶ札",
    replacement: "浮かぶカード",
    meaning: "影を付けて、ほかの表示の上に重ねて出す表示",
  },
  {
    spelling: "吊り札",
    replacement: "吊り下げのカード",
    meaning: "押すと下に吊るように開く、モデルや effort などを選ぶ表示",
  },
  {
    spelling: "卒業の札",
    replacement: "卒業のカード",
    meaning: "卒業したことを、枠と地を付けて見せる表示",
  },
  {
    spelling: "形の札",
    replacement: "形の名前",
    meaning: "レポートのセクションが表す内容の形（手順・比較など）を言う名前",
  },
  {
    spelling: "変更の札",
    replacement: "変更のラベル",
    meaning: "最終レポートの頭の1行に出す「変更 n ファイル +a −b」の字",
  },
  {
    spelling: "部屋の名前の札",
    replacement: "部屋の名前のラベル",
    meaning: "画面の上端の左に出す、部屋の名前とセッションの短縮IDの字",
  },
  {
    spelling: "セッションの札",
    replacement: "セッションのラベル",
    meaning: "画面の上端の左に出す、部屋の名前とセッションの短縮IDの字",
  },
  {
    spelling: "絞り込みの札",
    replacement: "絞り込みのバッジ",
    meaning: "タスクを状態で絞る、件数つきの小さな印",
  },
  {
    spelling: "等幅の札",
    replacement: "等幅のバッジ",
    meaning: "答え待ちのカードの中に、選択肢を同じ幅で並べる小さな印",
  },
  {
    spelling: "出典の札",
    replacement: "出典のバッジ",
    meaning: "本文の横の余白に出す、出典を示す小さな印",
  },
  {
    spelling: "列挙型の札",
    replacement: "列挙型のバッジ",
    meaning: "表のセルに出す、同じ字は同じ色の小さな印",
  },
] as const
