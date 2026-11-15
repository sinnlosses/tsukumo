// 帯の設定の、背景の暗さ・パネルのぼかし・パネルの濃さ。利用者の端末の設定（`localStorage`）。
// 動かすたびに `documentElement` へ反映して保存する（範囲入力の連続した変更でも、書く先は小さな1つの入れ物）。
// 背景の暗さは動かすまで値を持たず、その間はパックの値に従う。操作子にはパックの値を出し、読み出しで「パックの値」と分かるようにする。

import { useState } from "react"

import {
  DEFAULT_APPEARANCE_ADJUST,
  hasAppearanceAdjust,
  loadAppearanceAdjust,
  saveAppearanceAdjust,
  type AppearanceAdjust,
} from "../../../../domain/appearance-adjust.ts"
import { applyAppearanceAdjust } from "../../../../stores/appearance-adjust-root.ts"
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
  /** 1つも動かしていないときは押せない（戻す先が無い）。 */
  readonly resetDisabled: boolean
  readonly onReset: () => void
}

export function useAppearanceAdjust(): AppearanceAdjustControl {
  const [value, setValue] = useState<AppearanceAdjust>(loadAppearanceAdjust)
  const packVeil =
    useSession((session) => session.state.character?.background?.veil) ?? FALLBACK_PACK_VEIL

  function commit(next: AppearanceAdjust): void {
    applyAppearanceAdjust(next)
    setValue(next)
    saveAppearanceAdjust(next)
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
    resetDisabled: !hasAppearanceAdjust(value),
    onReset: () => {
      commit(DEFAULT_APPEARANCE_ADJUST)
    },
  }
}
