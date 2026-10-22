# コーディング規約: 整形の対象外と常設の文章

ステータス: **正典**。入口は `docs/coding-standards.md`（規約の理由と例外の入口と、子のファイルの一覧）。

責務: oxfmt にかけないディレクトリとその理由、毎ターン載る常設の文章（`AGENTS.md`・`.claude/rules/`）の字数の上限と足すなら削る梯子を持つ。
読む時: 整形の対象を確かめるとき、`AGENTS.md`・`.claude/rules/` に書き足すとき。
直す時: 整形の対象外・字数の上限・梯子を変えたとき（検査は `test/architecture/always-on-budget.test.ts`）。

## 節の索引

| 節                  | 中身                                                                             |
| ------------------- | -------------------------------------------------------------------------------- |
| ## 整形の対象外     | `.claude/` を oxfmt にかけない理由                                               |
| ## 常設の文章の字数 | `AGENTS.md` 9,000字・rules 合計2,400字の上限と、足すなら削る梯子、値を見直す条件 |

## 整形の対象外

`oxfmt` は `.prettierignore` に従い、**`.claude/` と `docs/history/` と `test/e2e/expected/` を
整形しない**。

`.claude/skills/` の大半は [mattpocock/skills](https://github.com/mattpocock/skills) 由来で、
上流から取り直すことがある。こちらの整形（セミコロン除去・強調記法の統一）をかけてしまうと、
取り直したときの差分が実質的な変更と見分けられなくなる。

`docs/history/` は**過去の記録**で、書いた時点の文言がそのまま残っていることに意味がある。
加えて oxfmt の折り返しは、強調（`**`）の範囲をずらしたりコード中の `*` を `_` に変えたりして
**中身を壊す**（2026-09-20に19行が壊れた）。

`test/e2e/expected/` は E2E の足場が書く期待値で、`pnpm run test:e2e:update` のたびに書き直す。
整形をかけると書き直すたびに `format:check` が落ち、走らせた結果（`/tmp/tsukumo-e2e/`）とも
そのまま diff できなくなる。

`docs/history/` 以外の `docs/` は整形の対象に含める。表の桁揃えが全角文字幅を考慮して揃うので、
手で書くより正確になる。

## 常設の文章の字数

毎ターン載る `AGENTS.md` と、触るファイルに合うと載る `.claude/rules/` は、読まれる回数が最も多く、
足した分だけ全ターンの文脈を押す。そこで字数に上限を掛け、**足すなら何かを削る**を規則にする。
検査は `test/architecture/always-on-budget.test.ts`。

- 上限は `AGENTS.md` が9,000字、`.claude/rules/*.md` が合計2,400字。字数は文字数（`[...text].length`）で数える
- 増やしたいときは上限を上げず、何かを削る。出し先の梯子は
  hook・検査 → スクリプト → スキル → サブエージェント → 常設の文章（右へ行くほど常に載る）
- 値を見直すのは、常設の文章の最小値を再演で測り直したとき（`docs/research/harness-strategy.md` の戦略の段2）だけ。
  経緯は `docs/research/harness-strategy.md` 3.2.4
