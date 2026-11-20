// 帯の設定の、背景の暗さ・パネルのぼかし・パネルの濃さ。覚え先は `~/.tsukumo/state.json`（手続き `setGearPreference`）。
// 動かすたびに `documentElement` へ反映して覚えさせる。操作子に出すのは、動かすまでは届いた値（覚えた値）、動かしたあとは動かした値。
// 背景の暗さは動かすまで値を持たず、その間はパックの値に従う。操作子にはパックの値を出し、読み出しで「パックの値」と分かるようにする。

import { useState } from "react"

import {
  DEFAULT_APPEARANCE_ADJUST,
  type AppearanceAdjust,
} from "../../../../../shared/session/gear-preference.ts"
import { countAppearanceAdjust } from "../../../../domain/appearance-adjust.ts"
import { applyAppearanceAdjust } from "../../../../stores/appearance-adjust-root.ts"
import { useGearPreferences } from "../../../../stores/gear-preference-seed.ts"
import { useSession } from "../../../../stores/session.ts"

// パックが背景の `veil` を持たないときに操作子へ出す値。パックの定義で `veil` を省略したときの値と同じ。
const FALLBACK_PACK_VEIL = 0.75

export type ScreenNavSettingsAdjust = {
  /** 背景の暗さ（%）。動かしていない間は、パックの値を写した操作子の位置。 */
  readonly veilPercent: number
  /** 動かしていない（パックの値に従っている）か。 */
  readonly veilFollowsPack: boolean
  readonly onChangeVeilPercent: (percent: number) => void
  readonly blur: number
  readonly onChangeBlur: (px: number) => void
  readonly fill: number
  readonly onChangeFill: (percent: number) => void
}

type AppearanceAdjustControl = {
  readonly adjust: ScreenNavSettingsAdjust
  /** 既定から動かしてある調整の数。 */
  readonly changedCount: number
  readonly onReset: () => void
}

export function useAppearanceAdjust(): AppearanceAdjustControl {
  const stored = useGearPreferences().appearanceAdjust
  // 3つは1欄にまとめて書くので、覚えた値が届く前に続けて動かすと、届く前の値に重ねて前の動きを消してしまう。
  // 一度動かしたら、このあとは自分が動かした値に重ねる。
  const [committed, setCommitted] = useState<AppearanceAdjust>()
  const value = committed ?? stored
  const dispatch = useSession((session) => session.dispatch)
  const packVeil =
    useSession((session) => session.state.character?.background?.veil) ?? FALLBACK_PACK_VEIL

  function commit(next: AppearanceAdjust): void {
    setCommitted(next)
    applyAppearanceAdjust(next)
    void dispatch.session.setGearPreference({ field: "appearanceAdjust", value: next })
  }

  return {
    adjust: {
      veilPercent: Math.round((value.veil ?? packVeil) * 100),
      veilFollowsPack: value.veil === undefined,
      onChangeVeilPercent: (percent) => {
        commit({ ...value, veil: percent / 100 })
      },
      blur: value.blur,
      onChangeBlur: (px) => {
        commit({ ...value, blur: px })
      },
      fill: value.fill,
      onChangeFill: (percent) => {
        commit({ ...value, fill: percent })
      },
    },
    changedCount: countAppearanceAdjust(value),
    onReset: () => {
      commit(DEFAULT_APPEARANCE_ADJUST)
    },
  }
}
