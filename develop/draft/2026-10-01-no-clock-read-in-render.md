# 描画中に時計を読む呼び出しを検査で落とす（振り返り: GH-198）

- 札: 黄 正典の不備（1回目）
- 根拠: GH-198 で `useRevealedChatLog` が描画中に `nowEpochMilliseconds()` を読んでいたが、React Compiler がその呼び出しを `[entries, lastRevealAt, shown]` だけを鍵に覚えたため、タイマーで描き直しても時刻が読み直されなかった。単体テスト（Vitest）には Compiler が掛からない（`vitest.config.ts` の冒頭で決めている）ので見えず、E2E の `chat-restored-history`・`chat-compact-boundary` が落ちて初めて分かった。直し方は、タイマーが鳴った時刻を state に持たせて描画中の値に混ぜる形
- 出し先: `test/architecture.test.ts`（か lint）に、`src/browser/` の部品とフックの本体（effect とイベントの手の外）で `nowEpochMilliseconds`・`Temporal.Now` を呼ぶことを落とす検査を足す。あわせて `docs/coding-standards.md`「React」節に「描画中に時計を読まない（時刻は state か props で受ける）」を1行足す
