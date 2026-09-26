// ブラウザ側の入口。
// `bun build src/browser/main.tsx --target=browser` がここから辿って束ねる（tsconfig の `"jsx": "react-jsx"`）。
// CSS もここから辿る（下の `styles/theme.css` と、各機能が import する `*.module.css`）。
// そのため、スクリプトと CSS は1回の組み立てから出る対になる（`src/server/view-server/adapter/bundle.ts`）。
// 副作用（`createRoot(...).render(...)`）を持つのはここだけ（`docs/architecture.md`「各ファイルの責務」）。
// 中身（Provider と、画面を選ぶ `<Root>`）は `app.tsx` の `<App>` で、ここは描き始める前の1回と mount だけを持つ。

import { createRoot } from "react-dom/client"

import { App } from "./app.tsx"
import {
  applyAppearanceColorOverride,
  loadAppearanceColorOverride,
} from "./domain/appearance-color.ts"
// ページ全体の下地（トークン・body・リンク）。グローバルな CSS はこれだけ。
// 機能ごとの見た目は各機能の `*.module.css` にある（docs/design.md 6.6）。
import "./styles/theme.css"

// 保存済みの画面の色を `documentElement` へ反映する1回。
// 最初の描画より前に差す必要があるので、色を持つ部品（帯の歯車。13.9）の初期化には任せない。
// 任せると、保存した色が一瞬だけ既定で描かれてから入れ替わる。
applyAppearanceColorOverride(loadAppearanceColorOverride())

const appRoot = document.querySelector("#app")
if (appRoot !== null) {
  createRoot(appRoot).render(<App />)
}
