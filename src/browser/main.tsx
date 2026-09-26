// ブラウザ側の入口。**`bun build src/browser/main.tsx --target=browser` がここから辿って束ねる**
// （tsconfig の `"jsx": "react-jsx"`）。**CSS もここから辿る**（下の `styles/theme.css` と、
// 各機能が import する `*.module.css`）ので、スクリプトと CSS は1回の組み立てから出る対になる
// （`src/server/view-server/adapter/bundle.ts`）。副作用（`createRoot(...).render(...)`）を持つのは
// ここだけ（`docs/architecture.md`「各ファイルの責務」）。**中身（Provider と画面の選択）は
// `app.tsx` の `<App>`** で、ここは描き始める前の1回と mount だけを持つ。
//
// **移行の段6で `<div id="app">` に1つの root をまとめた**（段3〜5は `.layout-sidebar` 等の
// 複数の root だった。段の記録は `docs/history/decision.md`「design.md 12. 移行の段階」）。

import { createRoot } from "react-dom/client"

import { App } from "./app.tsx"
import {
  applyAppearanceColorOverride,
  loadAppearanceColorOverride,
} from "./domain/appearance-color.ts"
// ページ全体の下地（トークン・body・リンク）。**グローバルな CSS はこれだけ**で、機能ごとの
// 見た目は各機能の `*.module.css` にある（docs/design.md 6.6）。
import "./styles/theme.css"

// 保存済みの画面の色を `documentElement` へ反映する1回。**最初の描画より前に差す**必要が
// あるので、色を持つ部品（帯の歯車。13.9）の初期化には任せない——任せると、保存した色が
// 一瞬だけ既定で描かれてから入れ替わる。
applyAppearanceColorOverride(loadAppearanceColorOverride())

const appRoot = document.querySelector("#app")
if (appRoot !== null) {
  createRoot(appRoot).render(<App />)
}
