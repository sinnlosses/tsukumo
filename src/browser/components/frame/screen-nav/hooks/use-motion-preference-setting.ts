// 帯の設定の、動きを減らす好み。利用者の端末の設定（`localStorage`）。
// 文書の根の属性（CSS の動き）はその場で差し直す。JavaScript 側の演出はマウント時の値を読むので、開いている最中の演出には効かない。

import { useState } from "react"

import {
  DEFAULT_MOTION_PREFERENCE,
  isMotionPreference,
  loadMotionPreference,
  saveMotionPreference,
  type MotionPreference,
} from "../../../../domain/motion-preference.ts"
import { applyMotionPreference } from "../../../../stores/motion-preference-root.ts"

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
  const [value, setValue] = useState<MotionPreference>(loadMotionPreference)

  function commit(next: MotionPreference): void {
    setValue(next)
    saveMotionPreference(next)
    applyMotionPreference(next)
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
    changedCount: value === DEFAULT_MOTION_PREFERENCE ? 0 : 1,
    onReset: () => {
      commit(DEFAULT_MOTION_PREFERENCE)
    },
  }
}
