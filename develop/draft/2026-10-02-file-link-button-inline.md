# レポートの本文で、押せるパスのボタンが長いと文から外れて中央寄せの別行になる（振り返り: GH-250）

- 札: 黄 実装の誤り（1回目）
- 根拠: GH-250 の目視で、流れの段の中のリポジトリのパス（`src/browser/components/page/conversation/components/main-view/markdown/report-notation.module.css`）が、本文の行から外れて中央寄せの2行になった。`.report-file-link` は `display: inline` を当てているが、`<button>` は Chrome では `inline-block` に強制される（委譲先が最小再現で確かめた）。そのうえ UA 既定の `text-align: center` が効く。流れに限らず、長いパスを文中に書いたレポートならどこでも起きる
- 出し先: tsukumo のタスクにする。押せるパスを `<button>` ではなく、文の中で折り返せる要素（例: `role="button"` と `tabIndex` を付けた `<span>`、または `<a>`）にして、キーボードでの押し方と読み上げを保つ。`box-decoration-break: clone` で折り返しても札の地を保つ
