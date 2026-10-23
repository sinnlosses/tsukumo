// 帯の設定の、タスクの実行で呼ぶスキル。利用者の端末の設定（`localStorage`）。
// 確認ダイアログが開くたびに読むので、変えたあとに開く確認から効く。

import { useState } from "react"

import { loadLaunchSkill, saveLaunchSkill } from "../../../../domain/launch-skill.ts"

/** タスクの実行で呼ぶスキルの操作子。書いた文字列をそのまま表示値にする（畳むのは文面を組む側）。 */
export type ScreenNavSettingsLaunchSkill = {
  readonly value: string
  readonly onChange: (value: string) => void
}

export function useLaunchSkillSetting(): ScreenNavSettingsLaunchSkill {
  const [launchSkill, setLaunchSkill] = useState<string>(loadLaunchSkill)

  function onChange(value: string): void {
    setLaunchSkill(value)
    saveLaunchSkill(value)
  }

  return { value: launchSkill, onChange }
}
