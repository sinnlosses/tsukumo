# use-character-edit のテストが決め打ちの待ちで負荷の下で揺れる（振り返り: T-825）

- 札: 黄 揺れ（1回目）
- 根拠: T-825 の委譲先が `pnpm run test` を3並行×10回、CPU の負荷の下で走らせたところ、対象外の `test/browser/components/page/character/components/hooks/use-character-edit.test.tsx` が 2/30 回落ちた。このファイルは `setTimeout(resolve, 250)` の決め打ちの待ちを3箇所に持ち、T-825 で直した `fake-driver.test.ts` の `tick()` と同じ形をしている
- 出し先: `use-character-edit.test.tsx` の決め打ちの待ちを、待ちたい状態が実際に来るまで待つ形（`vi.waitFor` など）に替えるタスクにする。あわせて `test/` に残る `setTimeout(resolve, <数>)` の待ちを洗い、同じ形のものを並べて登録するかを決める
