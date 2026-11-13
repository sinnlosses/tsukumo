// 設定の画面（`#settings`）の中身。新しい器では部屋の頭の「設定」から開く紙に、旧い器では全面に出る。
import type { ReactElement } from "react"

import { ScreenNavSettingsSheet } from "./components/screen-nav-settings-sheet.tsx"
import { useSettings } from "./hooks/use-settings.ts"

export function SettingsScreen(): ReactElement {
  return <ScreenNavSettingsSheet settings={useSettings()} />
}
