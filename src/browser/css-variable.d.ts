// React の `CSSProperties` は CSS カスタムプロパティ（`--foo`）を意図的に持たない
// （`@types/react` の型定義のコメント: 「モジュール拡張で自分の index signature を足せ」）。
// **レイアウトの比率（`src/browser/components/page/conversation/components/conversation-layout/hooks/use-conversation-layout.ts`）が `style` に
// `--layout-row-top` 等を直接書く**ので、ここで1回だけ拡張する（型を迂回するキャストは書かない。
// `docs/coding-standards.md`「型を迂回するキャストを使わない」）。

import "react"

declare module "react" {
  interface CSSProperties {
    [customProperty: `--${string}`]: string | number | undefined
  }
}
