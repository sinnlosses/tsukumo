# 会話の画面の段の E2E「板を開いたまま窓を広げても…」が、落ちたときに modal のまま残った `<dialog>` の名前を出すようにする（振り返り: GH-507）

- 観点: 黄 検証の揺れ
- 根拠: GH-507 の `tw verify` で `test/e2e/conversation-tier.test.ts` の同じ1件が 2026-10-10 12:16〜12:19 に3回続けて落ちた（委譲先の `tw verify` 2回とメインの単独実行1回。310 行目 `dialog:modal` が残る）。`src/browser` は main のままで、その後は別の担当の4回と委譲先の3回目の `tw verify` がすべて通った。`dist/browser` の鮮度は `test/built-ui-setup.ts` が見ているので古い成果物は原因から外れる。落ちた時点で残った `<dialog>` がどれかを出していないので、揺れの元（`BottomSheet` の `use-close-when-wide` か、ほかの dialog か、同時に走っていた撮影か）を切り分けられなかった
- 出し先: タスクにする。310 行目の検査を、modal のまま残った `<dialog>` の `aria-label` を出す形にして（`expect(…).toEqual([])` で名前の配列を比べる）、次に落ちたときに切り分けられるようにする
