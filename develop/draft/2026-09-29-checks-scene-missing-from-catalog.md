# 検証結果の入った場面を撮る道具が無く、委譲先もメインも空の画面を撮った（振り返り: T-836）

- 札: 赤 道具（2回目。T-836・T-837）
- 根拠: `report` の `checks` を描く疑似場面は `test/fixture/fake-session.json` の `report-tool` だけで、`scripts/capture-catalog.ts` の `--only` に対応する件が無い。`scripts/capture-view.ts` は要素を待つ口を持たず、場面が流れ切る前（約8秒）に撮る。T-836 の委譲先は一時スクリプトで撮って表の無い空のメインビューを得た。メインも受け入れで最初に `capture-view.ts` を使って同じく空の画面を撮り、自作の Playwright スクリプトで表の要素を待って撮り直した。タスクの完了条件に「撮影する」と書いたが、撮る手段を指していなかった。T-837 でも `flow` を描く疑似場面が無く、メインが fixture に一時的に塊を足して起こし、自作スクリプトで撮った（要素だけ撮ると演出の途中で空になり、表示から8秒待ってページごと撮り直した）
- 出し先: タスク。`capture-catalog.ts` に `report-tool` 場面で検証結果の表まで待って撮る件（例 `report-checks`）と、`list` の `flow` を含む場面と件を足す。あわせて `capture-view.ts` に `--wait-for <selector>` を足し、`docs/architecture/testing.md`「手で確かめること」から引けるようにする
