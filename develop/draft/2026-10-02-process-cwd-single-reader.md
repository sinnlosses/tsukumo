# `process.cwd()` を読む場所を1つに集め、それ以外の読み取りを検査で落とす（振り返り: GH-244）

- 札: 黄 制約違反（10回目）
- 根拠: CLAUDE.md は「環境変数・パスの読み取りは1モジュールに集約」とするが、`src/view-delivery.ts` は `process.cwd()` を6か所で直に読み、GH-244 の委譲先はそれに倣って7か所目を足した（`WiringContext.cwd` が届かないため）。規約が機械で守られていないので、前例に倣うと増える
- 出し先: `src/view-delivery.ts` に cwd を引数で渡す配線へ直し、`test/architecture.test.ts`（か lint）に「`process.cwd()` は集約先のモジュールでだけ読む」の検査を足すタスク
