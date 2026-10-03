# `tw edit` で `## やること` 以外の節を作業のあとに直しても、計画の記録を after-work に変えない（振り返り: GH-252）

- 札: 黄 道具（16回目）
- 根拠: GH-252 の受け入れで、委譲先が申し送った1行を `tw edit GH-252 --section '注意'` で足そうとしたら `WORK_BEFORE_PLAN` で拒まれ、`--after-work` を付けて打ち直すと `tw plan-check` が `PLAN_FIRST` から `PLAN_NOT_FIRST after-work` に変わった。計画は作業より先に書かれていたのに、記録が上書きされた
- 出し先: claude-skills の `tw edit`（`task-workflow`）で、`WORK_BEFORE_PLAN` の関門と計画の記録を `--section 'やること'` のときだけに掛ける。`next-task` の手順6に「受け入れで `## 注意` へ申し送りを足す」手を書くならその形も合わせる
