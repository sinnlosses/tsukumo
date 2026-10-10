# お伺いの札（`inquiry/`）を `main-view` の外へ移し、`main-view.tsx` の `InquiryCard` の再エクスポートを消す（振り返り: GH-523）

- 観点: 黄 コーディング規約
- 根拠: GH-523 で答え待ちの札（`pending-ask-card/`）が板の中に `InquiryCard` を出すため、`test/architecture.test.ts` の「部品のディレクトリの外から引いてよいのは `<部品>.tsx` だけ」を避けて `main-view/main-view.tsx` から再エクスポートした。`docs/architecture.md`「全体構成」の置き場の表では、2つの部品が読む部品は `conversation/components/<部品>/` に置く。`inquiry/` が `main-view/markdown/`（`deferred-markdown.tsx`・`report-notation.module.css`）を読むので、移すと markdown の置き場も動く。再エクスポートで迂回する形は検査が拒まないので、次に部品の中を別の部品から使うときも同じ迂回が増える
- 出し先: タスクにする。`inquiry/` を `conversation/components/inquiry/` へ移し、それが読む `markdown/` の置き場を置き場の表で決め直す。あわせて、部品の `<部品>.tsx` が子部品の中身を再エクスポートするのを `test/architecture.test.ts` で拒む
