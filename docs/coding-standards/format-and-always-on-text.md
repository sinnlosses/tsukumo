# コーディング規約: 整形の対象外と常設の文章

ステータス: **正典**。入口は `docs/coding-standards.md`（規約の理由と例外の入口と、子のファイルの一覧）。

責務: oxfmt にかけないディレクトリとその理由、毎ターン載る常設の文章（`AGENTS.md`・`.claude/rules/`・systemPrompt の規約・`task-writing.md`・`implementer-brief.md`）の字数の上限と足すなら削る梯子を持つ。
読む時: 整形の対象を確かめるとき、`AGENTS.md`・`.claude/rules/` に書き足すとき。
直す時: 整形の対象外・字数の上限・梯子・超えたときの扱いを変えたとき（実測とドラフトは `scripts/dev/token-limit.ts`）。

## 整形の対象外

`oxfmt` は `.prettierignore` に従い、**`.claude/` と `docs/history/` と `test/e2e/expected/` を
整形しない**。

`.claude/skills/` の大半は [mattpocock/skills](https://github.com/mattpocock/skills) 由来で、
上流から取り直すことがある。こちらの整形（セミコロン除去・強調記法の統一）をかけてしまうと、
取り直したときの差分が実質的な変更と見分けられなくなる。

`docs/history/` は**過去の記録**で、書いた時点の文言がそのまま残っていることに意味がある。
加えて oxfmt の折り返しは、強調（`**`）の範囲をずらしたりコード中の `*` を `_` に変えたりして
**中身を壊す**（実際に19行が壊れたことがある）。

`test/e2e/expected/` は E2E の足場が書く期待値で、`pnpm run test:e2e:update` のたびに書き直す。
整形をかけると書き直すたびに `format:check` が落ち、走らせた結果（`/tmp/tsukumo-e2e/`）とも
そのまま diff できなくなる。

`docs/history/` 以外の `docs/` は整形の対象に含める。表の桁揃えが全角文字幅を考慮して揃うので、
手で書くより正確になる。

## 常設の文章の字数

毎ターン載る `AGENTS.md` と、触るファイルに合うと載る `.claude/rules/` は、読まれる回数が最も多く、
足した分だけ全ターンの文脈を押す。そこで字数に上限を掛け、**足すなら何かを削る**を規則にする。

- 上限の値は `scripts/shared/addition-budget.ts` の `AGENTS_MD_LIMIT`・`RULES_TOTAL_LIMIT`・`SYSTEM_PROMPT_TOTAL_LIMIT`・`TASK_WRITING_LIMIT`・`IMPLEMENTER_BRIEF_LIMIT`・`REPORT_INPUT_SCHEMA_MAX_CHARS` が持つ。字数は文字数（`[...text].length`）で数える
- 上限を掛けるのは、上の2つと、systemPrompt の規約 4 本（`SPEECH_CADENCE_PROMPT`・`WORK_PLAN_PROMPT`・`REPORT_NOTATION_PROMPT`・`QUESTION_NOTATION_PROMPT`）の合計、`report` の引数の schema、`docs/workflow/task-writing.md`、実装役が毎件読む `implementer-brief.md`。`implementer-brief.md` は submodule の中なので読むだけで、縮めるのは tsukumo-plugins 側
- 値の置き方: 毎歩の文脈に載るもの（systemPrompt の規約・schema・`AGENTS.md`・`.claude/rules/`・`implementer-brief.md`）は縮める側に置き、いまの字数を下回ってもよい。たまにしか読まれないもの（`task-writing.md`）は丸めた値に置く。足すたびに上限を「いま＋少し」へ上げない
- 増やしたいときは何かを削る。出し先の梯子は
  hook・検査 → スクリプト → スキル → サブエージェント → 常設の文章（右へ行くほど常に載る）
- 余白は `node scripts/dev/addition-margin.ts` で見る

## 上限を超えたとき

上の字数と、ファイルの大きさ（`docs/workflow/worktree-and-ship.md`「コミット前のファイルの大きさの検査」）の上限は、
**超えても検査を落とさない**。`pnpm run check` の `token-limit` の段（`scripts/dev/token-limit.ts`）が実測し、
超えた上限ごとに `tw new --draft` で見直しのドラフトを積む。作業はそのまま続けてよい。

- ドラフトの題は `上限超過: <上限の名前>（<いま>／上限 <値>）を見直す`。同じ上限の課題が閉じずに残っていれば積み直さない
- 承認したドラフトは、縮めて上限以内に戻すか、値を見直す。値を上げる変更は人の承認を要する
- 定期の見直し: 前回の見直しの日（`scripts/shared/budget-review.ts` の `BUDGET_REVIEWED_ON`）から 30 日を過ぎると、
  同じ段が `上限の定期見直し: …` のドラフトを1件積む。見直しでは `/token-usage-diet` で毎歩の文脈に載る量を見て値を決め直し、`BUDGET_REVIEWED_ON` を見直した日にする
