// React の `CSSProperties` は CSS カスタムプロパティ（`--foo`）を意図的に持たない（`@types/react` の型定義のコメント: 「モジュール拡張で自分の index signature を足せ」）。
// レイアウトの比率（`useConversationLayout`）が `style` に `--layout-row-top` 等を直接書くので、ここで1回だけ拡張する。

import "react"

declare module "react" {
  interface CSSProperties {
    [customProperty: `--${string}`]: string | number | undefined
  }
}
