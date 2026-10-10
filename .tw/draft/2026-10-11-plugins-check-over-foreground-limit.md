# tsukumo-plugins の `./check.sh` を前景の上限（600秒）に収める（振り返り: GH-598）

- 観点: 黄 道具の経済
- 根拠: GH-598 の委譲先の作業ツリーで `./check.sh` が約7.5分、`task.py verify` が約10分かかり、前景の上限 600 秒を超えて背景に回った（材料の「時間の偏り」Bash 601秒・452秒・237秒。friction log の黄の行）。tsukumo-plugins を直すタスクは毎回この検証を打つ
- 出し先: tsukumo-plugins の `check.sh` の段ごとの所要を測り、変えたファイルに合わせて自己テストを絞る（か並べて走らせる）タスク
