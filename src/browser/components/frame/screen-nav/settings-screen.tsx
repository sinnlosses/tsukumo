// 設定の画面（`#settings`）の中身。新しい器では部屋の頭の「設定」から開く紙に、旧い器では全面に出る。
// 中身は帯の歯車から開くダイアログと同じ面を並べる。

import type { ReactElement } from "react"

import { ScreenNavSettingsFaces } from "./components/screen-nav-settings-dialog.tsx"
import { useSettings } from "./hooks/use-settings.ts"

export function SettingsScreen(): ReactElement {
  return <ScreenNavSettingsFaces settings={useSettings()} />
}
