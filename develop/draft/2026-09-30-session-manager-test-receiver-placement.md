# `session-manager.test.ts` に集まったほかの機能のコマンドの受け手のテストを、受け手の側へ移すか決める（作業中: GH-115）

- 根拠: `test/server/session/core/session-manager.test.ts` は 3,359 行・99 件で、`manager.commands.*`（`createCommandRouter` 越しの呼び出し）が 69 箇所ある（`session.reflectAchievement` 9・`session.switchCharacter` 9・`session.setChatMode` 8・`characterPack.*` 10・`host.openFile` 3・`chat.forgetRememberedLine` 3 など）。`session-manager.ts` 自身は代の寿命と反応の順だけを持つので割らないと決めた（`docs/architecture/adr/0021-feature-state-fold-in-feature.md`「同じ設計で分けないと決めたもの」）が、テストの大きさはこの受け手のテストから来ていて、設計の決定では減らない
- 出し先: タスク1件。`test-audit` の4つの問いで、受け手のテストを `src/router.ts` の受け手ごとのテスト（またはその機能の `core` のテスト）へ移すか、`createSessionManager` の入口で守るまま残すかを決める。`startSession` の配線を分けるタスク（GH-128）と同じ時期なら、配線の単体テストを持つかの結論と揃える
