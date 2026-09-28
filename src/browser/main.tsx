// ブラウザ側の入口。
// `vite build`（Vite の設定の `input`）がここから辿って、スクリプトと CSS を1回の組み立てで束ねる。
// 副作用（`createRoot(...).render(...)`）を持つのはここだけ。
// 中身は `<App>` で、ここは描き始める前の1回と mount だけを持つ。

import { createRoot } from "react-dom/client"

import { App } from "./app.tsx"
import {
  applyAppearanceColorOverride,
  loadAppearanceColorOverride,
} from "./domain/appearance-color.ts"
// ページ全体の下地（トークン・body・リンク）。グローバルな CSS はこれだけ。
import "./styles/theme.css"

// 保存済みの画面の色を `documentElement` へ反映する1回。
// 最初の描画より前に差す必要があるので、色を持つ部品（帯の歯車）の初期化には任せない。
// 任せると、保存した色が一瞬だけ既定で描かれてから入れ替わる。
applyAppearanceColorOverride(loadAppearanceColorOverride())

const appRoot = document.querySelector("#app")
if (appRoot !== null) {
  createRoot(appRoot).render(<App />)
}
