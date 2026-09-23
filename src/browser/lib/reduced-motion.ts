// 「動きを減らす」設定（CSS の `prefers-reduced-motion` メディアクエリ）を JavaScript から読む。
//
// **CSS の規則だけでは足りない**（`styles/theme.css` の `@media (prefers-reduced-motion: reduce)`
// は CSS のアニメーションとトランジションにしか効かない）ので、**時間で見せ方を進める演出は
// ここを自分で見る**（レポートを書き上げる `features/main-view/reveal/use-report-reveal.ts`、
// 雑談のセリフが育つ `features/chat-view/hooks/use-speech-growth.ts`）。

/** 利用者が「動きを減らす」を選んでいるか。 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
