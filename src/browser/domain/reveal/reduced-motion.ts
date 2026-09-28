// 「動きを減らす」設定（CSS の `prefers-reduced-motion` メディアクエリ）を JavaScript から読む。
//
// `theme.css` の `@media (prefers-reduced-motion: reduce)` は CSS のアニメーションとトランジションにしか効かないので、時間で見せ方を進める演出はここを自分で見る。

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
