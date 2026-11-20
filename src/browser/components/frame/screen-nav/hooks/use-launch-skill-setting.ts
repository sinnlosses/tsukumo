// 帯の設定の、タスクの実行で呼ぶスキル。利用者の端末の設定（`localStorage`）。
// 確認ダイアログが開くたびに読むので、変えたあとに開く確認から効く。
// 選択肢は「未設定」と、ワークフローが返す入口のスキル。

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import {
  DEFAULT_LAUNCH_SKILL,
  loadLaunchSkill,
  saveLaunchSkill,
} from "../../../../domain/launch-skill.ts"
import { rpc } from "../../../../stores/rpc.ts"

const UNSET_LABEL = "未設定"
const UNKNOWN_SUFFIX = "（一覧に無い）"

type ScreenNavSettingsLaunchSkillOption = {
  readonly value: string
  readonly label: string
}

/** タスクの実行で呼ぶスキルの操作子。`value` は保存した名前そのもの（空は未設定）。 */
export type ScreenNavSettingsLaunchSkill = {
  readonly value: string
  readonly onChange: (value: string) => void
}

type LaunchSkillControl = {
  readonly launchSkill: ScreenNavSettingsLaunchSkill
  /** 未設定のままなら 0、スキルを選んであれば 1。 */
  readonly changedCount: number
  readonly onReset: () => void
}

export function useLaunchSkillSetting(): LaunchSkillControl {
  const [launchSkill, setLaunchSkill] = useState<string>(loadLaunchSkill)

  function onChange(value: string): void {
    setLaunchSkill(value)
    saveLaunchSkill(value)
  }

  return {
    launchSkill: { value: launchSkill, onChange },
    changedCount: launchSkill === DEFAULT_LAUNCH_SKILL ? 0 : 1,
    onReset: () => {
      onChange(DEFAULT_LAUNCH_SKILL)
    },
  }
}

/** 面を開いたときだけ入口のスキルを引き、選択肢にする。読めないときは未設定（と保存済みの名前）だけ。 */
export function useLaunchSkillOptions(
  selected: string,
): readonly ScreenNavSettingsLaunchSkillOption[] {
  const entries = useQuery(rpc.workflowSetting.entries.queryOptions({ retry: false }))

  const known = (entries.data ?? []).map((entry) => ({
    value: entry.value,
    label: entry.title,
  }))
  const unknown =
    selected === "" || known.some((option) => option.value === selected)
      ? []
      : [{ value: selected, label: `${selected}${UNKNOWN_SUFFIX}` }]
  return [{ value: "", label: UNSET_LABEL }, ...known, ...unknown]
}
