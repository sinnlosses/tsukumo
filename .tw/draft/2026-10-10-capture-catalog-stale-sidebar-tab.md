# `capture-catalog.ts` の狭い窓のタブのセレクタを今の引き出しに合わせ、`has-text` の文字も src に実在するかを検査で突き合わせる（振り返り: GH-508）

- 観点: 黄 機械の検査
- 根拠: GH-508 で 720px の撮影を確かめたところ、`scripts/capture-catalog.ts` の `SIDEBAR_TAB_SELECTOR`（`[role="tab"]:has-text("サイドバー")`、`task-board` の件の準備の手）は今の画面に当たらなかった。引き出しの中のタブは「やり取り」「タスク」「使用量」（`use-screen-nav.ts` の `TAB_LABELS`）。カタログの `prepare` は当たらない手を飛ばして撮るので、壊れたまま黙って撮れてしまう。GH-509 は `aria-label` の値だけを突き合わせる
- 出し先: タスクにする。`SIDEBAR_TAB_SELECTOR` を引き出しを開く口とタスクのタブの2手に直し、GH-509 の検査の範囲を `has-text("…")` の文字にも広げる（GH-509 の本文に足すか、別のタスクにする）
