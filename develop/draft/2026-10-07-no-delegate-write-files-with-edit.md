# 委譲先の定義に、ファイルは Edit・Write で書くことを足す（振り返り: GH-478）

- 観点: 赤 道具の経済
- 根拠: GH-478 では、委譲先が段1と段2で1回ずつ、python3 の heredoc と `cat >` でファイルを書こうとした。どちらも hook `deny-sed-in-place` に拒まれ、Edit・Write で打ち直した（委譲先の friction log）。GH-424 の委譲先にも同じ拒否が出ていた。
- 出し先: claude-skills の `agents/no-delegate.md` の本文に、ファイルの作成・書き換えは Edit・Write で行い、シェル（heredoc・リダイレクト・`sed -i`・python3 の書き込み）では書かないと1行で足すタスク
