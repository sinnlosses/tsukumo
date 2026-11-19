// 動きを減らすかどうかを `<html data-motion="reduce">` へ差す。`styles/reduced-motion.css` の規則はこの属性だけを見る。
// 減らすかどうかの判定は `prefersReducedMotion`（OS の設定と歯車の好みの合成）に任せる。

import { loadMotionPreference, type MotionPreference } from "../domain/motion-preference.ts"
import { OS_REDUCED_MOTION_QUERY, prefersReducedMotion } from "../domain/reveal/reduced-motion.ts"

export function applyMotionPreference(value: MotionPreference): void {
  if (prefersReducedMotion((query) => window.matchMedia(query), value)) {
    document.documentElement.dataset["motion"] = "reduce"
  } else {
    delete document.documentElement.dataset["motion"]
  }
}

/** OS の設定が途中で変わったときも差し直す。起動時に1回呼ぶ。 */
export function followOsMotionPreference(): void {
  window.matchMedia(OS_REDUCED_MOTION_QUERY).addEventListener("change", () => {
    applyMotionPreference(loadMotionPreference())
  })
}
