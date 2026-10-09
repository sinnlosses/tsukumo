# 狭い画面の引き出し（`NavDrawer`）も、開いたまま窓を広げたら閉じる（振り返り: GH-522）

- 観点: 黄 機械の検査
- 根拠: GH-522 で、`@media` で隠す `<dialog>`（板 `BottomSheet`）を開いたまま窓を 760px より広げると `dialog:modal` が残り、広い画面が塞がることを E2E で測った。板は `ui/bottom-sheet/hooks/use-close-when-wide.ts` で直した。GH-521 の `NavDrawer` も同じ `<Dialog>` の作りで、同じ穴があるおそれがある（未確認）
- 出し先: タスク。`NavDrawer` で同じ穴を実ブラウザで確かめ、当たれば板と同じく広げたら閉じるようにする（`use-close-when-wide` を `ui/dialog` の側へ寄せて両方で使うかも決める）。`test/e2e/conversation-tier.test.ts` に引き出しを開いたまま広げる1本を足す
