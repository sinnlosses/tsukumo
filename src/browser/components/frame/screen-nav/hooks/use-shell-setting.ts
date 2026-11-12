// 帯の設定の、会話の画面の器（旧い器と新しい器「舞台と紙」）。利用者の端末の設定（`localStorage`）。
// 器の印は読み込んだときにしか読まないので、選んだら読み込み直す。

import { isShell, shownShell, switchShell, type Shell } from "../../../../stores/shell-mark.ts"

export type ScreenNavSettingsShell = {
  readonly value: Shell
  readonly onChange: (value: string) => void
}

export function useShellSetting(): ScreenNavSettingsShell {
  const value = shownShell(document.documentElement)

  function onChange(next: string): void {
    // 知らない値と、いまの器と同じ値では読み込み直さない。
    if (isShell(next) && next !== value) {
      switchShell(next)
    }
  }

  return { value, onChange }
}
