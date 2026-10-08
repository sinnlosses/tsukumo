# `tw verify`・`tw pause` が着手中のタスクの ID を1つだけ渡されても受け付ける（振り返り: GH-491）

- 観点: 黄 道具の経済
- 根拠: GH-491 の委譲先が `tw verify GH-491` と `tw pause GH-491` を打ち、2回とも usage で拒まれて打ち直した（verify は引数なし、pause は段の番号まで要る）。`tw show`・`tw edit`・`tw step` は ID を取るので、ID の渡し方がコマンドごとに違う
- 出し先: claude-skills の `tw`（task-workflow）。着手の印が立ったタスクの ID 1つだけを渡された `verify`・`pause` は、印と一致すれば引数なしと同じに扱う（違えば今のとおり拒む）。WORKFLOW.md「`tw` コマンドの参照」の usage も揃える
