# 検証結果の入った場面を撮る道具が無く、委譲先もメインも空の画面を撮った（振り返り: T-836）

- 札: 赤 道具（1回目）
- 根拠: `report` の `checks` を描く疑似場面は `test/fixture/fake-session.json` の `report-tool` だけで、`scripts/capture-catalog.ts` の `--only` に対応する件が無い。`scripts/capture-view.ts` は要素を待つ口を持たず、場面が流れ切る前（約8秒）に撮る。T-836 の委譲先は一時スクリプトで撮って表の無い空のメインビューを得た。メインも受け入れで最初に `capture-view.ts` を使って同じく空の画面を撮り、自作の Playwright スクリプトで表の要素を待って撮り直した。タスクの完了条件に「撮影する」と書いたが、撮る手段を指していなかった
- 出し先: タスク。`capture-catalog.ts` に `report-tool` 場面で検証結果の表まで待って撮る件（例 `report-checks`）を足す。あわせて `capture-view.ts` に `--wait-for <selector>` を足し、`docs/architecture/testing.md`「手で確かめること」から引けるようにする
