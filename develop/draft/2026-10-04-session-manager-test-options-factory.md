# `session-manager.test.ts` で `createSessionManager` の口を1か所の組み立て関数から作り、口を1つ足すたびに十数か所を直さなくて済むようにする（振り返り: GH-337）

- 札: 黄 構造の重さ（2回目）
- 根: session-manager-test-options-spread
- 根拠: GH-337 は `SessionManagerOptions` に `questionUsageLog` を1つ足しただけで、`test/server/session/core/session-manager.test.ts` の18か所に同じ1行を足した。同じ日の GH-334（`diagnosticLog`）も同じ18か所に足していて、2つを並べて取り込むと末尾の `describe` どうしが衝突し、互いに足りない口を手で補った
- 出し先: テストの中で口を全部並べて `createSessionManager` を呼んでいる箇所を、既定の口を返す1つの組み立て関数＋そのテストで差し替える口だけの上書きに寄せるタスク。次に口を足すときはテストの変更が1か所になる
