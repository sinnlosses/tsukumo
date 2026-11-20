// 帯の設定の、書き上げる演出の速さ。利用者の端末の設定（`localStorage`）。
// 演出の速さは `useReportReveal` がマウント時に読むだけなので、変えても書いている最中の演出には効かない。

import { useState } from "react"

import {
  DEFAULT_REVEAL_SPEED,
  isRevealSpeed,
  loadRevealSpeed,
  saveRevealSpeed,
  type RevealSpeed,
} from "../../../../domain/reveal-speed.ts"

/** 書き上げる演出の速さの操作子。色と同じ利用者の設定なので、書いた値をそのまま表示値にする（読み直さない）。 */
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
  // 選ぶたびに保存する（色のようにドラッグで連続しないので、まとめる必要が無い）。
  const [revealSpeed, setRevealSpeed] = useState<RevealSpeed>(loadRevealSpeed)

  function commit(value: RevealSpeed): void {
    setRevealSpeed(value)
    saveRevealSpeed(value)
  }

  function onChange(value: string): void {
    // 知らない値は受け取らない（`<select>` の選択肢の外から来たときは何もしない）。
    if (isRevealSpeed(value)) {
      commit(value)
    }
  }

  return {
    revealSpeed: { value: revealSpeed, onChange },
    changedCount: revealSpeed === DEFAULT_REVEAL_SPEED ? 0 : 1,
    onReset: () => {
      commit(DEFAULT_REVEAL_SPEED)
    },
  }
}
