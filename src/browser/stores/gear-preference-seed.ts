// 歯車の設定を読む口。
// 起こしたときの `gear-preferences-changed` が届くまでは、ページに焼かれた塊（描き始める前に1回だけ置く）の値を返し、届いたあとはセッションの姿の値を返す。
// 塊を置くのはブラウザ側の入口だけで、置く前に読むと既定が返る。

import {
  foldGearPreferences,
  type FoldedGearPreferences,
  type GearPreferences,
} from "../../shared/session/gear-preference.ts"
import { prefersReducedMotion } from "../domain/reveal/reduced-motion.ts"
import type { RevealMotion } from "../domain/reveal/use-report-reveal.ts"
import { withMigratingGearPreferences } from "./gear-preference-legacy.ts"
import { useSession } from "./session.ts"

let seed: FoldedGearPreferences = foldGearPreferences(undefined)

export function holdGearPreferenceSeed(value: FoldedGearPreferences): void {
  seed = value
}

/** 部品から読む、いまの歯車の設定。 */
export function useGearPreferences(): GearPreferences {
  return withMigratingGearPreferences(
    useSession((session) => session.state.gearPreferences) ?? seed.values,
  )
}

/** 描画の外から読む、いまの歯車の設定。 */
export function currentGearPreferences(): GearPreferences {
  return withMigratingGearPreferences(useSession.getState().state.gearPreferences ?? seed.values)
}

/** レポートの書き上げる演出に渡す、いまの速さと動きを減らすか。 */
export function revealMotionNow(): RevealMotion {
  return {
    revealSpeed: currentGearPreferences().revealSpeed,
    reducedMotion: prefersReducedMotionNow(),
  }
}

/** OS の設定と歯車の「動き」の好みを合わせて、いま動きを減らすか。 */
export function prefersReducedMotionNow(): boolean {
  return prefersReducedMotion(
    (query) => window.matchMedia(query),
    currentGearPreferences().motionPreference,
  )
}
