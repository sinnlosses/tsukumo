// 新しい器「舞台と紙」の部屋の頭の下に置く「今日の灯り」の入口。

import type { ReactElement } from "react"

import { PresentationalTodayLamp } from "./components/today-lamp.tsx"
import { useTodayLamp } from "./hooks/use-today-lamp.ts"

export function TodayLamp(): ReactElement {
  return <PresentationalTodayLamp view={useTodayLamp()} />
}
