// React の `CSSProperties` は CSS カスタムプロパティ（`--foo`）を意図的に持たない（`@types/react` の型定義のコメント: 「モジュール拡張で自分の index signature を足せ」）。
// 部品が `style` に CSS 変数（舞台の立ち絵の位置など）を直接書くので、ここで1回だけ拡張する。

import "react"

declare module "react" {
  interface CSSProperties {
    [customProperty: `--${string}`]: string | number | undefined
  }
}
