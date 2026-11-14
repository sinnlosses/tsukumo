// サイドバーの下端の帯の入口。

import type { ReactElement } from "react"

import { useSidebarFooter } from "../hooks/use-sidebar-footer.ts"
import { PresentationalSidebarFooter } from "./presentational-sidebar-footer.tsx"

export function SidebarFooter(): ReactElement {
  return <PresentationalSidebarFooter {...useSidebarFooter()} />
}
