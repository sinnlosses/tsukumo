# `fake-driver.test.ts` の report の預かりが負荷の下で揺れる（振り返り: T-807）

- 黄 揺れ: `pnpm run test` を3並行×10ラウンド流した負荷試験で、`test/server/session-driver/adapter/fake-driver.test.ts`「report は結果が届くまで預かり、差し戻された（isError の）ものは流さない」が30回中1回だけ `expected […isError:true] to deeply equal […isError:false]` で落ちた（T-807 の委譲先の friction log）。受け入れでも単独の `pnpm run test` が1回だけ 1 failed になり、続けて4回流すと再現しなかった（どのテストかは取り損ねた）
- 提案: T-807 と同じく決め打ちの待ちや到着順に頼っていないかを調べて直すタスクにする（完了条件は T-807 と同じく負荷の下で10回流して落ちないこと）
