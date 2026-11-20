// 帯の設定の、動きを減らす好み。覚え先は `~/.tsukumo/state.json`（手続き `setGearPreference`）。表示は届いた値に従う。
// 文書の根の属性（CSS の動き）はその場で差し直す。JavaScript 側の演出はマウント時の値を読むので、開いている最中の演出には効かない。

import {
  BUILTIN_GEAR_PREFERENCES,
  type MotionPreference,
} from "../../../../../shared/session/gear-preference.ts"
import { useGearPreferences } from "../../../../stores/gear-preference-seed.ts"
import { applyMotionPreference } from "../../../../stores/motion-preference-root.ts"
import { useSession } from "../../../../stores/session.ts"
import { isMotionPreference } from "../domain/motion-preference.ts"

export type ScreenNavSettingsMotion = {
  readonly value: MotionPreference
  readonly onChange: (value: string) => void
}

type MotionPreferenceControl = {
  readonly motion: ScreenNavSettingsMotion
  /** 「OS の設定に従う」のままなら 0、変えてあれば 1。 */
  readonly changedCount: number
  readonly onReset: () => void
}

export function useMotionPreferenceSetting(): MotionPreferenceControl {
  const value = useGearPreferences().motionPreference
  const dispatch = useSession((session) => session.dispatch)

  function commit(next: MotionPreference): void {
    applyMotionPreference(next)
    void dispatch.session.setGearPreference({ field: "motionPreference", value: next })
  }

  return {
    motion: {
      value,
      onChange: (next) => {
        if (isMotionPreference(next)) {
          commit(next)
        }
      },
    },
    changedCount: value === BUILTIN_GEAR_PREFERENCES.motionPreference ? 0 : 1,
    onReset: () => {
      commit(BUILTIN_GEAR_PREFERENCES.motionPreference)
    },
  }
}
