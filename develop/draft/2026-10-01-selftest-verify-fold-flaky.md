# claude-skills の `selftest_task.py` の verify の取り込みの検査が時々落ちる原因を調べて直す（振り返り: GH-139）

- 札: 黄 揺れ（8回目）
- 根拠: GH-139 の委譲先の friction log。`./check.sh` で「作業は未コミットのまま残る」「同じファイルの別の行の変更は両方残る」の2件が2回落ち、打ち直すと通った。単独実行では変更前の本体の作業ツリーでも1回落ちたので、GH-139 の変更とは無関係。claude-skills の検証コマンドが運で通る状態だと、スキルを直すタスクの受け入れが毎回打ち直しに頼る
- 出し先: タスク1件（claude-skills の `skills/task-workflow/scripts/selftest_task.py` の verify の取り込みの検査が落ちる条件を突き止め、決まって通るようにする）
