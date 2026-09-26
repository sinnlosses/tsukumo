// 「動きを減らす」設定（CSS の `prefers-reduced-motion` メディアクエリ）を JavaScript から読む。
//
// CSS の規則だけでは足りない（`styles/theme.css` の `@media (prefers-reduced-motion: reduce)`
// は CSS のアニメーションとトランジションにしか効かない）ので、時間で見せ方を進める演出は
// ここを自分で見る（レポートを書き上げる `use-report-reveal.ts`）。読むのは `reveal/` の
// 中だけなので機能の中に置く（docs/design.md 2章「`lib/` と `utils/` に置く基準」）。

/** 利用者が「動きを減らす」を選んでいるか。 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
