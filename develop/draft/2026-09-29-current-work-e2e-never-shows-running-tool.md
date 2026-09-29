**E2E の current-work-long-tool が、題の「実行中のツールが出る」を一度も写していないのを直す**

- 根拠: `test/e2e/expected/current-work-long-tool.dom.json` は、作られたコミット（`7c3a61e0`）から今まで8回書き換わったが、どの版も `data-work-state="idle"`・「依頼待ち」で、いまの版には実行中のツールもいまの作業の札も出ていない。場面 `long-tool`（`test/fixture/fake-session.json`）は `request` を流さないので、`currentTurnSteps` が「依頼が一度も無い」に畳む（`docs/architecture/testing.md`「手で確かめること」が撮影の道具の側で同じ理由を書いている）。`it` の題は「ツールが走っているあいだ、帯の「いまの作業」に実行中のツールが出る」で、ページ全体の写しの書き換えに紛れて「揺れずに間違った期待値」になっていた。期待値の範囲を絞る設計を調べていて見つけた
- 出し先: E2E を直すタスク1件。撮影の道具の `current-work-running` と同じく自分の `request` を持つ場面を使う（か `long-tool` に `request` を足す）。いまの作業の札はメインビューの下に浮かぶ位置へ移ったので、`it` の題も直す。期待値の範囲を絞る実装と同じ枝でやるなら、この場面の範囲に `main` を選んで札が写ることを確かめる
