# `capture-view.ts --wait-for` の演出待ちの上限を、長いレポートでも書き上げ終わるまで待てる形にする（振り返り: GH-252）

- 札: 黄 道具（17回目）
- 根拠: GH-252 の委譲先が、節3つの場面 `report-task-verdict` を `capture-view.ts --wait-for` で測ろうとしたところ、書き上げる演出が `WAIT_FOR_TIMEOUT_MS`（15 秒）のうちに終わらず失敗した。scratchpad に自前の計測スクリプトを書いて代えた（`scripts/capture-view.ts` の `waitForRevealSettled`）
- 出し先: `scripts/capture-view.ts` で、演出を待つあいだはブラウザの時計を進めて演出を終わらせる（E2E の `settledDom` と同じ形）か、`--wait-for` の上限を引数で渡せるようにする。どちらかを `docs/architecture/testing.md` の撮影の手順にも書く
