# CLAUDE.md の「よく使うコマンド」に整形の `pnpm run format`（oxfmt）を足す（振り返り: GH-506）

- 観点: 黄 道案内
- 根拠: 2026-10-09 の GH-529・GH-530・GH-506 の3件で、委譲先が `pnpm exec prettier` を打って「not found」に当たり、`oxfmt`・`pnpm run format:check` を探し直した（各 friction log）
- 出し先: CLAUDE.md「よく使うコマンド」のコードブロックに `pnpm run format` の1行（整形は oxfmt で、prettier は入っていない）を足す
