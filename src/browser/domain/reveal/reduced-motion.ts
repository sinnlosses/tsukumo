// 「動きを減らす」設定を JavaScript から読む。OS の設定（CSS の `prefers-reduced-motion` メディアクエリ）と、歯車の「動き」の好み（`motion-preference`）のどちらかが立っていれば減らす。
//
// `styles/reduced-motion.css` の規則は CSS のアニメーションとトランジションにしか効かないので、時間で見せ方を進める演出はここを自分で見る。

import type { MotionPreference } from "../../../shared/session/gear-preference.ts"

export type MatchMedia = (query: string) => { readonly matches: boolean }

export const OS_REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

export function prefersReducedMotion(
  matchMedia: MatchMedia,
  preference: MotionPreference,
): boolean {
  return preference === "reduce" || matchMedia(OS_REDUCED_MOTION_QUERY).matches
}
