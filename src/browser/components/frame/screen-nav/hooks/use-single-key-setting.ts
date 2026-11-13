// 帯の設定の、紙の1字のキー（`d`・`o`・`?`）を効かせるか。利用者の端末の設定（`localStorage`）。

import { useState } from "react"

import { loadSingleKeys, saveSingleKeys } from "../../../../stores/single-key-setting.ts"

export type ScreenNavSettingsSingleKeys = {
  readonly value: boolean
  readonly onChange: (value: boolean) => void
}

export function useSingleKeySetting(): ScreenNavSettingsSingleKeys {
  const [value, setValue] = useState<boolean>(loadSingleKeys)

  function onChange(next: boolean): void {
    setValue(next)
    saveSingleKeys(next)
  }

  return { value, onChange }
}
