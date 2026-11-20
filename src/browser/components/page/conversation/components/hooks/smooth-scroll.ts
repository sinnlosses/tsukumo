import { prefersReducedMotionNow } from "../../../../../stores/gear-preference-seed.ts"

// 滑らかに転がす指定（`scrollIntoView`・`scrollTo` の `behavior`）を1か所で決める。
// `styles/reduced-motion.css` の規則は CSS にしか効かず、ここで渡す `behavior` には届かない。

/** 動きを減らす設定なら滑らせず一度で送り（`"instant"`）、そうでなければ滑らかに転がす（`"smooth"`）。 */
export function smoothScrollBehavior(): ScrollBehavior {
  return prefersReducedMotionNow() ? "instant" : "smooth"
}
