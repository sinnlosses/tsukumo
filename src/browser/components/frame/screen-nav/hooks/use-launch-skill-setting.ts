// 帯の設定の、タスクの実行で呼ぶスキル。覚え先は `~/.tsukumo/state.json`（手続き `setGearPreference`）。表示は届いた値に従う。
// 確認ダイアログが開くたびに読むので、変えたあとに開く確認から効く。
// 選択肢は「未設定」と、ワークフローが返す入口のスキル。

import { useQuery } from "@tanstack/react-query"

import { BUILTIN_GEAR_PREFERENCES } from "../../../../../shared/session/gear-preference.ts"
import { useGearPreferences } from "../../../../stores/gear-preference-seed.ts"
import { rpc } from "../../../../stores/rpc.ts"
import { useSession } from "../../../../stores/session.ts"

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
  const launchSkill = useGearPreferences().launchSkill
  const dispatch = useSession((session) => session.dispatch)

  function onChange(value: string): void {
    void dispatch.session.setGearPreference({ field: "launchSkill", value })
  }

  return {
    launchSkill: { value: launchSkill, onChange },
    changedCount: launchSkill === BUILTIN_GEAR_PREFERENCES.launchSkill ? 0 : 1,
    onReset: () => {
      onChange(BUILTIN_GEAR_PREFERENCES.launchSkill)
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
