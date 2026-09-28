# 検証結果の入った場面が撮影のカタログに無く、委譲先が自作の撮影で詰まった（振り返り: T-836）

- 札: 赤 道具（1回目）
- 根拠: `report` の `checks` を描く疑似場面は `test/fixture/fake-session.json` の `report-tool` だけで、`scripts/capture-catalog.ts` の `--only` に対応する件が無い。T-836 の委譲先は一時スクリプトで tsukumo を起こして撮り、表が描かれる前の空のメインビューを撮ったうえ、起こしたサーバが終わらず報告を返せないまま約30分止まった（人が「長いね」と気づいてメインが止め、撮影をやり直した）
- 出し先: タスク。`capture-catalog.ts` に `report-tool` 場面で検証結果の表まで待って撮る件（例 `report-checks`）を足し、`docs/architecture/testing.md`「手で確かめること」から引けるようにする
