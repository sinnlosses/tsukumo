# 質問の記法の指示（`QUESTION_NOTATION_PROMPT`）に、選択肢の preview へ手元の画像を `![説明](パス)` で書けることを足す（振り返り: GH-338）

- 札: 黄 前提
- 根: question-preview-image-unannounced
- 根拠: GH-338 で質問の preview の Markdown の画像を棚から描けるようにしたが、本体へ渡す質問の記法の指示（`QUESTION_NOTATION_PROMPT`）は preview に画像を書けることを伝えていない。このままでは実際の会話で画像が使われにくい（委譲先の報告。範囲の外として触らなかった）
- 出し先: タスクにする。`QUESTION_NOTATION_PROMPT` に、preview に手元の画像（作業ツリーの中の png など）を `![説明](パス)` で書けること・外部 URL と `data:` は描かれないことを1〜2文で足し、指示文の単体テストを合わせる。`docs/architecture/display.md`「許可と質問」の preview の項から指示文に伝えていることが分かるようにする
