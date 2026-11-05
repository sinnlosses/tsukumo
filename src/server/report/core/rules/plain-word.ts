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
    replacement: "エッジ",
    meaning:
      "図の中で、ノード（ファイルや部品の名前を置く点）とノードをつなぐ線。「A が B に値を渡す」というつながりを表す",
  },
  {
    spelling: "節点",
    replacement: "ノード",
    meaning: "図の中で、ファイルや部品の名前を1つ置く点。エッジの両端になる",
  },
  {
    spelling: "転がして",
    replacement: "スクロールして",
    meaning: "枠に収まらない中身を、枠の中で上下に送って続きを見ること",
  },
  {
    spelling: "窓",
    replacement: "ビューポート",
    meaning:
      "tsukumo の画面を開いたブラウザの、中身を描ける領域の幅と高さ（1440x900 など）。別のブラウザの窓はウィンドウ、記録の窓は集計期間、のぞき窓はプレビュー、モデルが一度に読める量の窓はコンテキストウィンドウと書く",
  },
  {
    spelling: "進み具合の帯",
    replacement: "進み具合のプログレスバー",
    meaning: "画面の端に出す、いま計画のどこまで進んだかをフェーズの並びで見せる表示",
  },
  {
    spelling: "余白の柱の包み",
    replacement: "欄外注の列の外枠",
    meaning: "本文の右の余白に欄外注を並べる列を、画面の中で囲む要素",
  },
  {
    spelling: "傍注の包み",
    replacement: "欄外注の外枠",
    meaning: "本文の横の余白に出す欄外注を、画面の中で囲む要素",
  },
  {
    spelling: "傍注の柱",
    replacement: "欄外注の列",
    meaning: "レポートの本文の右の余白に、欄外注を並べる列",
  },
  {
    spelling: "余白の柱",
    replacement: "欄外注の列",
    meaning: "レポートの本文の右の余白に、欄外注を並べる列",
  },
  {
    spelling: "題つきの包み",
    replacement: "題つきの外枠",
    meaning: "番号つきの題を持つ図や表を、画面の中で囲む要素",
  },
  {
    spelling: "並列のフェーズの包み",
    replacement: "並列のフェーズの外枠",
    meaning: "同時に走らせるフェーズの棒をまとめて、画面の中で囲む要素",
  },
  {
    spelling: "包み関数",
    replacement: "ラッパー関数",
    meaning: "別の関数を呼ぶ前後に処理を足すために、その関数を包んだ関数",
  },
  {
    spelling: "包み hook",
    replacement: "ラッパー hook",
    meaning: "React の hook を呼ぶ前後に処理を足すために、その hook を包んだ hook",
  },
  {
    spelling: "傍注",
    replacement: "欄外注",
    meaning: "本文の横の余白の欄に添える、出典やどこを見るかを書いた短い注",
  },
  {
    spelling: "ワークフローの面",
    replacement: "ワークフローのサーフェス",
    meaning: "ワークフローの設定を描く、画面の中の領域（A2UI の surface）",
  },
  {
    spelling: "入力欄の面",
    replacement: "入力欄のサーフェス",
    meaning: "入力欄を描く、画面の中の領域（A2UI の surface）",
  },
  {
    spelling: "詳細の面",
    replacement: "詳細のサーフェス",
    meaning: "詳細を描く、画面の中の領域（A2UI の surface）",
  },
  {
    spelling: "並べた面",
    replacement: "並べたサーフェス",
    meaning: "比べるために並べて描いた、画面の中の領域（A2UI の surface）",
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
    meaning: "レポートの本文を区切る、見出しと部品の並びを持つ単位",
  },
  {
    spelling: "見出しの無い節",
    replacement: "見出しの無いセクション",
    meaning: "見出しを付けていない、レポートの本文の区切り",
  },
  {
    spelling: "節の塊",
    replacement: "セクションの部品",
    meaning: "レポートの本文の区切りの中に並ぶ、種類の決まった本文の1単位",
  },
  {
    spelling: "失敗の塊",
    replacement: "失敗の表示",
    meaning: "失敗で終わったやり取りのレポートの頭に出す、何が起きたかと次の手を載せた表示",
  },
  {
    spelling: "振り返りの塊",
    replacement: "振り返りの部品",
    meaning: "レポートの内容部品（文・表・図など中身を持つ部品）のうち、振り返りを書くもの",
  },
  {
    spelling: "お願いの塊",
    replacement: "お願いの部品",
    meaning: "レポートの内容部品のうち、利用者へのお願いを書くもの",
  },
  {
    spelling: "逃げ道の塊",
    replacement: "逃げ道の部品",
    meaning: "レポートの内容部品のうち、どの種類にも当てはまらないときに使う Markdown の本文",
  },
  {
    spelling: "検証結果の塊",
    replacement: "検証結果の部品",
    meaning: "レポートの内容部品のうち、テストや型検査の結果を書くもの",
  },
  {
    spelling: "ファイルの塊",
    replacement: "ファイルの部品",
    meaning: "レポートの内容部品のうち、触ったファイルの一覧を樹形図で見せるもの",
  },
  {
    spelling: "画像の塊",
    replacement: "画像の部品",
    meaning: "レポートの内容部品のうち、画像を載せるもの",
  },
  {
    spelling: "前後の塊",
    replacement: "前後の部品",
    meaning: "レポートの内容部品のうち、変える前と変えた後を並べて見せるもの",
  },
  {
    spelling: "図の塊",
    replacement: "図の部品",
    meaning: "レポートの内容部品のうち、図を描くもの",
  },
  {
    spelling: "何個目の塊",
    replacement: "何個目の部品",
    meaning: "レポートの本文で、何番目の内容部品かを指す言い方",
  },
  {
    spelling: "節が2つ以上",
    replacement: "セクションが2つ以上",
    meaning: "レポートの本文の区切りが複数あること",
  },
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
  {
    spelling: "画像の棚",
    replacement: "画像の置き場",
    meaning: "サーバのメモリに、レポートや依頼に添える画像を置いておく場所",
  },
  {
    spelling: "棚に置",
    replacement: "置き場に置",
    meaning: "画像をサーバのメモリの置き場に入れること",
  },
  {
    spelling: "棚から",
    replacement: "置き場から",
    meaning: "サーバのメモリの置き場から画像を取り出すこと",
  },
  {
    spelling: "台本",
    replacement: "ワークフロースクリプト",
    meaning:
      "Claude Code のワークフローのスクリプト。再現の手順ならシナリオ、合否を決めるコマンドなら判定コマンド、scripts/ なら開発用スクリプト",
  },
  {
    spelling: "目録の1行",
    replacement: "タスク見出し行",
    meaning: "レポートの先頭に出る、タスクID・名前・終わり方を並べた1行",
  },
  {
    spelling: "目録の末尾",
    replacement: "タスク見出し行の末尾",
    meaning: "レポートの先頭に出るタスクの1行の、右の端",
  },
  {
    spelling: "目録の頭",
    replacement: "タスク見出し行の頭",
    meaning: "レポートの先頭に出るタスクの1行の、左の端",
  },
  {
    spelling: "押す口",
    replacement: "ボタン",
    meaning: "画面の中で、押すと何かが起きる操作の部品",
  },
  {
    spelling: "押せる口",
    replacement: "ボタン",
    meaning: "画面の中で、押すと何かが起きる操作の部品",
  },
  {
    spelling: "開く口",
    replacement: "開くボタン",
    meaning: "押すと一覧やダイアログを開く、画面の操作の部品",
  },
  {
    spelling: "選び口",
    replacement: "選択メニュー",
    meaning: "押すと開き、キャラクターなどを1つ選ぶ一覧",
  },
  {
    spelling: "読み書き口",
    replacement: "読み書きの関数",
    meaning: "記録やファイルを読み書きする関数の組",
  },
  {
    spelling: "書き込み口",
    replacement: "書き込みの関数",
    meaning: "記録やファイルに書き込む関数（HTTP なら書き込みの API）",
  },
  {
    spelling: "受け取り口",
    replacement: "受け取る関数",
    meaning: "イベントや結果を受け取って処理する関数",
  },
  {
    spelling: "知らせ口",
    replacement: "知らせる関数",
    meaning: "失敗などを呼び出し元へ知らせるために渡す関数",
  },
  {
    spelling: "手続きが使う口",
    replacement: "手続きが使う関数",
    meaning: "画面からの手続きを処理するときに使う、配線が渡す関数の組",
  },
  {
    spelling: "合図が届",
    replacement: "通知が届",
    meaning: "委譲先やバックグラウンドタスクからの知らせ（通知）が届くこと",
  },
  {
    spelling: "合図の届",
    replacement: "通知の届",
    meaning: "委譲先やバックグラウンドタスクからの知らせ（通知）が届くこと",
  },
  {
    spelling: "合図を受け",
    replacement: "通知を受け",
    meaning: "委譲先やバックグラウンドタスクからの知らせ（通知）を受け取ること",
  },
  {
    spelling: "合図を送",
    replacement: "通知を送",
    meaning: "委譲先やバックグラウンドタスクへ知らせ（通知）を送ること",
  },
  {
    spelling: "脇の話のターン",
    replacement: "補足メッセージのターン",
    meaning: "親のターンに付く補足メッセージ（aside）を受けて進むターン",
  },
  {
    spelling: "脇の話の欄",
    replacement: "補足メッセージの欄",
    meaning: "親のターンに付く補足メッセージを並べる画面の欄",
  },
  {
    spelling: "脇の話の包み",
    replacement: "補足メッセージの包み",
    meaning: "補足メッセージを claude へ送るときに付けるタグの包み",
  },
  {
    spelling: "脇の話の答え",
    replacement: "補足メッセージへの答え",
    meaning: "補足メッセージに対する speak の答え",
  },
  {
    spelling: "脇の話のあいだ",
    replacement: "補足メッセージのあいだ",
    meaning: "補足メッセージが届いて進んでいる間",
  },
] as const satisfies readonly PlainWord[]
