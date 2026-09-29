# test/browser の components/domain と components/page を test-audit の監査モードで刈り込む（振り返り: GH-95）

- 札: 黄 正典の不備（1回目）
- 根拠: GH-95 は test/browser（109 ファイル）が1コミットで説明の付く量を超えたので、`## 決まっていること` に従い `features/task-board`・`components/ui`・`stores` で打ち切った（`domain`・`utils` は一覧で見て候補なし）。`components/domain`・`components/page` は未監査で、登録時の1件が範囲を見積もれていなかった
- 出し先: タスク1件（sonnet）。`components/domain`・`components/page` のテストを、`screen-nav`・`character-edit`・`main-view` など大きいファイルから E2E との重なりを見て刈り込む。大きければさらにまとまりで2件に分ける
