// 帯の設定の、書き上げる演出の速さ。覚え先は `~/.tsukumo/state.json`（手続き `setGearPreference`）。表示は届いた値に従う。
// 演出の速さは `useReportReveal` がマウント時に読むだけなので、変えても書いている最中の演出には効かない。

import {
  BUILTIN_GEAR_PREFERENCES,
  type RevealSpeed,
} from "../../../../../shared/session/gear-preference.ts"
import { isRevealSpeed } from "../../../../domain/reveal-speed.ts"
import { useGearPreferences } from "../../../../stores/gear-preference-seed.ts"
import { useSession } from "../../../../stores/session.ts"

export type ScreenNavSettingsRevealSpeed = {
  readonly value: RevealSpeed
  readonly onChange: (value: string) => void
}

type RevealSpeedControl = {
  readonly revealSpeed: ScreenNavSettingsRevealSpeed
  /** 既定（標準）のままなら 0、変えてあれば 1。 */
  readonly changedCount: number
  readonly onReset: () => void
}

export function useRevealSpeedSetting(): RevealSpeedControl {
  const revealSpeed = useGearPreferences().revealSpeed
  const dispatch = useSession((session) => session.dispatch)

  function commit(value: RevealSpeed): void {
    void dispatch.session.setGearPreference({ field: "revealSpeed", value })
  }

  function onChange(value: string): void {
    // 知らない値は受け取らない（`<select>` の選択肢の外から来たときは何もしない）。
    if (isRevealSpeed(value)) {
      commit(value)
    }
  }

  return {
    revealSpeed: { value: revealSpeed, onChange },
    changedCount: revealSpeed === BUILTIN_GEAR_PREFERENCES.revealSpeed ? 0 : 1,
    onReset: () => {
      commit(BUILTIN_GEAR_PREFERENCES.revealSpeed)
    },
  }
}
