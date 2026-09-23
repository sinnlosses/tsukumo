# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- **ポップオーバーの「外側を押す・Esc で閉じる」を `src/browser/hooks/` の1つのフックに寄せてから、次のポップオーバーを足す**（振り返り: T-382, T-385, T-399）
  - 根拠: `document` への `pointerdown` / `keydown` の購読が `use-screen-nav.ts`（「≡」）と `use-current-work.ts`（T-382 の札）にほぼ同じ形で2つある。T-382 の本文が「`use-screen-nav.ts` の「≡」と同じ購読の仕方」と指したので写しになった。未着手の T-399 は本文で `use-current-work.ts` を「前例」として指し、着手中の T-385 も「同じ仕組みに揃えるか」を論点に挙げているので、このままだと3つ目・4つ目の写しになる
  - 出し先: タスク（`src/browser/hooks/use-modal-dialog.ts` と同じく機能の語彙を持たないフックとして、開いている間だけ外側の押下と `Escape` を購読して閉じる関数を呼ぶものを切り出し、2つの呼び出し元を置き換える）。T-399 の本文の「前例」の行をそのフックへ差し替え、T-385 がまだ購読を書いていなければ依存に足す
- **帯の部品を「≡」の面へ通す経路を1本にする**（振り返り: T-382, T-383）
  - 根拠: 帯の部品は広い画面と「≡」の面の2か所に描くので、1つ足すたびに `ScreenNavView` → `PresentationalScreenNav` の分解 → `ScreenNavMenuProps` と `<ScreenNavMenu>` への受け渡し、と同じ値を項目ごとに書き足している（`ScreenNavMenuProps` の11項目のうち9つは `ScreenNavView` の写し）。T-383 は顔1つを足すのに `presentational-screen-nav.tsx` を5回・`use-screen-nav.ts` と `screen-nav-menu.tsx` を3回ずつ直し、T-382 は札の ref を `workToggleRefWide` / `workToggleRefNarrow` の2本にして同じ経路へ通した。T-385（歯車）・T-403・T-408 も帯に手を入れる
  - 出し先: タスク（`<ScreenNavMenu>` が `ScreenNavView` をそのまま受ける、または部品を一度だけ組み立てて両方の面に置く形に寄せ、部品を1つ足すときに触る場所を減らす。どちらの形にするかは `docs/design.md` 13章の帯の節と突き合わせて決める）
- **同じ理由を呼び出しの経路上の関数ごとにコメントへ書かず、決めている1か所に書いて他は `{@link}` で指す**（振り返り: T-393, T-394）
  - 根拠: T-393 は絞り込みの鍵を `family` から `tag` へ替えただけだが、`src/` の変更85行のうち62行がコメントで、`sdk-driver.ts`・`config.ts`・`session-restore.ts`・`session-start.ts`・`session-choice.ts` の5ファイルで同じ理由（部屋はポート1つにつき1つ・落ちた tsukumo の印と見分けられない）を書き直した。いまも「見分けられない」の説明が `config.ts`・`session-restore.ts`・`session-choice.ts` の3か所にある。`docs/coding-standards.md`「コメント」節の表は「今の挙動の制約・前提はコードに残す。必要なだけ長くてよい」だけで、同じ前提を何か所に書くかを決めていない
  - 出し先: `docs/coding-standards.md`「コメント」節に「同じ制約・前提は、それを決めている関数（絞り込むなら絞り込む関数）に1回だけ書き、経路上の他の関数は `{@link}` で指す」を足す。3か所に重なっている説明を1か所に畳むのは同じタスクで行う
