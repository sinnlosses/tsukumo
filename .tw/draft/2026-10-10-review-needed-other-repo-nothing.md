**作業先が別のリポジトリのタスクで、本体の作業ツリーで打った `review_needed.py` の `NOTHING` を「レビュー不要」と取り違えない（振り返り: GH-481）**

- 観点: 赤 手順の抜け
- 根拠: 2026-10-10 の `/loop` で、作業先が tsukumo-plugins のタスク（GH-544・GH-572・GH-573・GH-464）の受け入れで、メインが `review_needed.py --difficulty <d>` を本体（tsukumo-task）で引数なしに打ち、差分が無いので `NOTHING` が出てレビューを飛ばした。`skills/next-task/other-repo.md` 47〜48行目は作業先の作業ツリーで `main..<枝>` を渡して打つと書いているが、本体で打っても黙って `NOTHING` を返すので取り違えに気づけない。GH-481 で気づいて作業先の差分にレビューを掛け、正しさ2件（コミット後に打つと台本が素通りする等）が見つかった。GH-544 は Python の正規表現の変更で、本来は `REVIEW code` になる差分だった
- 出し先: tsukumo-plugins の next-task。`review_needed.py` が、引数なしで差分が無いとき、`tw show` の `### 作業先` が別のリポジトリなら `NOTHING` ではなく作業先で打つべき旨の行（例 `OTHER_REPO\t<作業先>`）を返す。あるいは SKILL.md 手順6の `review_needed.py` の表に「作業先が別のリポジトリなら other-repo.md の打ち方で」を1行足す（機械の方を優先）
