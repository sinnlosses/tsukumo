# E2E の上限の hook が `tw verify` を、tw が実際に打つコマンドで数える（振り返り: GH-424）

- 札: 赤 正典の不備（15回目）
- 根: e2e-run-limit-counts-verify
- 根拠: GH-424 で、`- 送る前の検証コマンド:` の行があると `tw verify` は `pnpm run check --full` を打つようになった。`scripts/lib/e2e-run-limit.ts` は `--full` の無い `tw verify` を「変えたファイル次第（by-change）」と数え、`docs/workflow.md`「E2E の上限」の段落（`--full` の無い `tw verify` の扱い）も同じ前提で書かれている。そのため、全件を流す `tw verify` を変えたファイル次第の1回として数え、文書だけ・`scripts/` だけの変更では数えない。前の手 GH-368 は `tw verify` を名前で分類したので、tw の側で打つコマンドが変わると、また黙ってずれる。
- 出し先: tsukumo の `scripts/lib/e2e-run-limit.ts` は、`tw verify` を名前で分類しない。CLAUDE.md の「## タスク運用」節から、tw と同じ規則で打つコマンドを読む（送る前の検証コマンドがあればそれ、無ければ検証コマンド）。そのコマンドを `check` の系統の分類にかける。あわせて `docs/workflow.md` の該当段落を直す。前の手（GH-368）は `tw verify` を固定の種類として数えていたので、tw が打つコマンドを変えると追随できなかった。今度は、tw と同じ設定の行を読むことで形ごと塞ぐ。
