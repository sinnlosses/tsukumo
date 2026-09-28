# テストのフィクスチャに書いた文字列が、文書の参照とタスク番号の検査に落とされる（振り返り: T-821）

- 札: 黄 正典の不備（2回目。1回目は T-747 の `docs/dummy/ticks.md`）
- 根拠: T-821 の委譲先が E2E の本文のフィクスチャに `docs/foo.md` と `GH-12` を書き、`test/section-reference.test.ts`（実在しない docs のパス）と `test/task-id.test.ts`（タスク番号）が落とした。T-747 でも `fake-session.json` の `docs/dummy/ticks.md` が同じ検査に落ちている。どちらも委譲先はその場で `foo/bar.md`・`X-012` などに直して通したが、フィクスチャの中の文字列も検査の対象になることはどこにも書かれていない
- 出し先: `docs/architecture/testing.md` のフィクスチャの節に「架空のパスは `docs/` で始めない・架空の ID は `T-` + 3桁と `GH-<n>` の形にしない（検査が本物として拾う）」の1行を足す
