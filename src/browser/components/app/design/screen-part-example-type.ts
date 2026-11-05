import type { ReactElement } from "react"

export type ScreenPartExample = {
  /** `src/browser/components/` からの部品のパス。見出しに出す。 */
  readonly path: string
  /**
   * 例を包む枠の種類。帯が自分の高さを持たないとき（`bar`）や、部品が真上に重ねる面の余地（`popup`）を前提にするときに選ぶ。
   * 部品の側は直さず、見本帳の枠で文脈を与える。
   */
  readonly frame: "flow" | "bar" | "popup"
  readonly render: () => ReactElement
}
