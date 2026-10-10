# E2E の足場で窓の大きさを変えたあと、再レイアウトが済むまで待つ（振り返り: GH-524）

- 観点: 黄 道具の経済
- 根拠: GH-524 の段4で、390x450 に `setViewportSize` した直後に撮った画が古い高さ（`scrollHeight` 844）のまま写り、目視で1回差し戻した。`scrollHeight` が窓の高さになるまで待つと正しく撮れた
- 出し先: タスクにする。`test/e2e/scenario-run.ts` に窓の大きさを変えて再レイアウトを待つ口を1つ置き（`scripts/capture-view.ts` の `--size` も同じ待ちを通す）、テストが直に `setViewportSize` を呼ぶ所をそこへ寄せる
