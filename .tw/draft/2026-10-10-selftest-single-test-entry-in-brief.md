# 委譲先の目に入る場所へ「selftest_task.py は関数名を渡すと単体で流せる」を1行書く（振り返り: GH-542）

- 観点: 黄 情報への手の届き
- 根拠: GH-542 の委譲先が `selftest_task.py` の全件を打ち、Bash の待ちが 573 秒・541 秒・388 秒になった。friction log には「1つだけ回す入口が無い」とあったが、入口は関数名を引数に渡す形で既にあり（`selftest_task.py` の先頭の使い方。GH-568 の担当は使えていた）、`implementer-brief.md` と `WORKFLOW.md` には書かれていない
- 出し先: tsukumo-plugins の `skills/next-task/implementer-brief.md` の「作業の作法」に1行（`python3 skills/task-workflow/scripts/selftest_task.py <関数名> …` で単体を流せる。全件は約 540 秒で、最後の `tw verify` でだけ流す）
