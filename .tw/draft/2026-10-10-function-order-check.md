# 関数の「外から使うもの → その内部で使うもの」の並びを検査で落とす（振り返り: GH-506）

- 観点: 黄 機械の検査
- 根拠: GH-506 の受け入れで、`question-brief.ts` の内部関数 `pairingReasons` が呼び元の前に、export の `briefedQuestions` が内部関数の後ろに置かれた。`pnpm run check` は通り、2回目のレビューでしか捕まらず、差し戻しが1往復増えた
- 出し先: lint のルールか `test/architecture.test.ts` に、同じファイルの中で export する関数が export しない関数より後ろに来たら落とす検査を足すタスク（CLAUDE.md「コーディング規約・レビュー方針」の1行目の規則を機械に移す）
