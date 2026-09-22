// ブラウザ側で現在時刻を読む唯一の場所。**返すのはエポックミリ秒の数**で、`Temporal.Instant`
// のままでは返さない — 経過時間の比較と引き算に使う相手（`src/shared/portrait-motion.ts` /
// `session-state.ts` の `at`）が数の契約だから。
//
// **読んだ値を畳み込みに渡さない**（状態の時刻はサーバが打つ。docs/design.md 4.1）。ここを使う
// のは「いま何ミリ秒経ったか」を画面に出すため。

/** いまのエポックミリ秒。 */
export function nowEpochMilliseconds(): number {
  return Temporal.Now.instant().epochMilliseconds
}
