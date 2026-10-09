// `<ScreenNav>` を描くテストが引き出しの差し込み口に渡す中身。
// 中身そのものを見ないテストは `EMPTY_NAV_DRAWER_SLOTS`、差し込んだものの出し分けを見るテストは `MARKED_NAV_DRAWER_SLOTS`（どの口のものかを `data-slot` で名乗る）を渡す。

import type { NavDrawerSlots } from "../../src/browser/components/domain/screen-nav/components/nav-drawer.tsx"

export const EMPTY_NAV_DRAWER_SLOTS = {
  runSetting: false,
  turns: false,
  tasks: false,
  usage: false,
} satisfies NavDrawerSlots

export const MARKED_NAV_DRAWER_SLOTS = {
  runSetting: <span data-slot="runSetting" />,
  turns: <span data-slot="turns" />,
  tasks: <span data-slot="tasks" />,
  usage: <span data-slot="usage" />,
} satisfies NavDrawerSlots
