# 対象を絞った単体テストに、規約の検査のテストを必ず添える（振り返り: GH-475）

- 観点: 黄 機械の検査
- 根拠: GH-469 と GH-475 で2件続けて、委譲先が対象を絞った単体テストを通したあと、`tw verify` の1回目が `test/architecture.test.ts`（コメントの日付・`report` イベントの直書き）と `test/task-id.test.ts`（テストに書いたタスク番号の書式）で落ち、直して打ち直した。どちらも変えたファイルとは別のテストファイルが規約を見ているので、絞った実行では拾えなかった。`tw verify` の1回は数分かかる
- 出し先: `docs/architecture/testing.md`（または CLAUDE.md「よく使うコマンド」）に、対象を絞って単体テストを打つときは `test/architecture.test.ts test/task-id.test.ts` を一緒に打つ、の1行を足す。仕組みにするなら、`pnpm run test -- <path>` の入口が規約の検査のテストを常に足す形にするタスク
