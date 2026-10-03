# 16進の色を `theme.css` の外に書くと落ちる検査を足し、いま外に書かれている3本をトークンに寄せる（振り返り: GH-277）

- 札: 黄 制約違反（11回目）
- 根拠: GH-277 で色の値の正典を `theme.css` の1か所にした。`browser.md`「CSS」は「16進の色を書いてよいのは `theme.css` だけ」と定めているが、機械の検査は無く、受け入れで `grep -rlE '#[0-9a-fA-F]{3,8}\b' src/browser --include='*.css'` を打つと `task-board.module.css`・`session-switcher.module.css`・`character-view.module.css` の3本に16進が直に書かれていた
- 出し先: 仕組みで塞ぐ。`test/architecture.test.ts`（か lint）に、`src/browser/` の `*.css` のうち `styles/theme.css` 以外で16進の色を書くと落ちる検査を足し、3本の16進をトークン（`var(--…)` か `color-mix`）に置き換えるタスクにする。描画が変わりうるので目視の段を入れる
