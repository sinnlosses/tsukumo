# `question_brief` の `figures` の `mermaid` の塊にも構文検査を掛け、割れる図を差し戻す（振り返り: GH-532）

- 観点: 黄 道案内
- 根拠: GH-532 で `report` の `mermaid` の塊に構文検査（`checkMermaidSyntax`・`broken-mermaid`）を足したが、`question_brief` の `figures` は口が `session-driver/core/question-brief.ts` の別の判定なので外にした。`docs/architecture/display.md` にも「質問の添え書き（`figures`）の図には掛けない」と書いてある
- 出し先: タスク。`question_brief` の受け付けで `figures` の `mermaid` の塊を `checkMermaidSyntax` に掛け、割れたら位置と字句の名前だけを添えて差し戻す。`display.md` の該当の箇条を直す
