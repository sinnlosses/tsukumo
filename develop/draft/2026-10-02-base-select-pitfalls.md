# `appearance: base-select` の落とし穴3つを正典の CSS の作法に足す（振り返り: GH-257）

- 札: 黄 正典の不備（11回目）
- 根拠: GH-257 の委譲先の friction log に3件。`::picker(select)` に `display` を無条件に書くと閉じているときも一覧が残って隣の口のクリックを塞ぐ（`:popover-open` で囲うと直る）、`<option>` に手で `aria-selected` を付けると Enter で値が確定しない（`:checked` で見た目を付ける）、`position-area` を指定しないと右端の口の札が窓の外へ出る。いずれも E2E と目視の往復で見つかり、受け入れで2回差し戻した
- 出し先: `docs/architecture/browser.md`「CSS」に customizable select を使うときの3点を足す（規約・正典の書き換え）
