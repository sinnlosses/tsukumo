**`scripts/capture-view.ts` でブラウザの時計を決めて撮れるようにする（振り返り: GH-209）**

- 観点: 黄 道具の不足
- 根拠: GH-209 の目視で、セッションの切り替えの一覧の「今日/昨日」と利用枠の「…に戻る」を撮る段で、`capture-view.ts` はブラウザの時計の日付を指定できず（`scripts/capture-view.ts:226` 付近）、疑似セッションの日付（2026-01-14）に対して一覧が全部「それより前」になった。委譲先はスクラッチに Playwright の台本を書き、`page.clock` で時計を固定して撮り直した。日付で表示が変わる部品（相対日付・「今日」の分け方・戻る時刻の日付つき表示）は今後も同じ手間になる
- 出し先: タスクにする（difficulty は sonnet）。`capture-view.ts` に `--clock <ISO 時刻>` を足し、Playwright の `page.clock.setFixedTime`（E2E の時計の凍らせ方に揃える）で撮る。`docs/architecture/testing.md`「手で確かめること」に1行足す
