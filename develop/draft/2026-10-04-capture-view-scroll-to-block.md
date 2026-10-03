# `scripts/capture-view.ts` に、指した要素までメインビューを送ってから撮る `--scroll-to <selector>` を足す（振り返り: GH-305）

- 札: 黄 道具（18回目）
- 根拠: GH-305 の委譲先は、レポートの下のほうにあるファイルの塊を撮る手段が `capture-view.ts` に無く、`spawnFakeTsukumo` を直に呼ぶ一時スクリプト（`scripts/_tmp-capture-files.ts`）を作って撮っては消す往復を3回した（委譲先の friction log）。狭い幅の画は手でスクロールした版と初期位置の版の2枚に分かれた
- 出し先: `scripts/capture-view.ts` の引数に `--scroll-to <selector>` を足し、`--wait-for` のあとで要素をメインビューの上端へ送ってから撮る。`docs/architecture/testing.md`「手で確かめること」の撮り方に1行足す
