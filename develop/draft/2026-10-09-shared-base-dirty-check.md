# 主ブランチへ合流する口（`ship`・`land`）の前提の確かめを1つの関数にまとめる（振り返り: GH-515）

- 観点: 赤 コーディング規約
- 根拠: GH-515 で足した `tw land` が、`ship` の `MAIN_DIRTY` と同じ「主ブランチを出している作業ツリーが汚れていれば合流しない」確かめを落とし、受け入れのレビューで差し戻した（tsukumo-plugins `skills/task-workflow/scripts/tw_ship.py` の `cmd_land` と `cmd_ship`）
- 出し先: tsukumo-plugins の `tw_ship.py` で、合流の前提（主ブランチの作業ツリーが在る・汚れていない・`.git` に書ける）を1つの関数にして `cmd_ship` と `cmd_land` が呼ぶタスク（tsukumo-plugins）
