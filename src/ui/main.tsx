// ブラウザ側の入口。**段2 ではまだ何も描かない**（`document` にも `console` にも触らない）。
//
// ここに置いてあるのは、段3 で `<App>` を mount するための足場だけ:
//   - `bun build src/ui/main.tsx --target=browser` が通ること（tsconfig の `"jsx": "react-jsx"`）
//   - 束ねたものが `/assets/ui.js` として配られ、レイアウトページから読まれること
//
// 副作用（`createRoot(...).render(...)`）を足すのは段3。それまでは旧のスクリプト
// （`/assets/browser.js`）が描いているページに、何もしないモジュールが1本増えるだけ。

import { type ReactElement } from "react"

/** 段3 で本物の `<App>`（接続・状態・コマンドの配り口）に置き換わる仮の部品。 */
export function App(): ReactElement {
  return <div className="ui-root" />
}
