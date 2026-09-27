# T-728 の背景に、浮かぶ部品を素の要素で書くか Base UI で書くかの見立てを足す（作業中: T-736）

- 根拠: T-736 の検討（`docs/research/browser-library.md`）で Base UI は「いまは入れない」とし、浮かぶ部品が要る最初の場面を T-728（ID の札のホバーの一行と、探す欄＋一覧の切り替え画面）とした。いまの `components/ui/` に浮かぶ部品は無く、`Dialog` は素の `<dialog>`、浮かぶ位置は CSS の anchor positioning（`character-view.module.css`）で書いている。Base UI の組み立ての増分は `Tooltip` で gzip 28KB・`Autocomplete` で 42KB（2026-09-27 に `/tmp` で測った）。いまの `/`・`@` の補完の一覧は `role="listbox"` も `aria-activedescendant` も持たない
- 出し先: T-728 の `## 背景` に1項。「ホバーの一行は素の `popover` と anchor positioning で書き、切り替え画面は `Dialog` の中に探す欄と一覧を置く。一覧は `role="listbox"` と `aria-activedescendant` で ↑↓ の選択を伝える。位置の追従やキーボードの扱いを自前で抱える量が `Dialog` の自作を超えたら、Base UI の `Tooltip` / `Preview Card` / `Autocomplete` を `docs/research/browser-library.md`「見直す条件」に従って測り直す（依存を足すならユーザーの承認）」
