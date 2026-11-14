// ブラウザ側の入口。
// `vite build`（Vite の設定の `input`）がここから辿って、スクリプトと CSS を1回の組み立てで束ねる。
// 副作用（`createRoot(...).render(...)`）を持つのはここと、最初に import する zod の設定だけ。
// 中身は `<App>` で、ここは描き始める前の1回と mount だけを持つ。

// zod のスキーマが作られる前に評価されないと効かないので、ほかのどの import よりも前に置く。
import "./lib/zod-jitless.ts"
// 層の順の宣言。ほかの CSS より先に評価されないと順が決まらないので、`App` の import より前に置く。
import "./styles/layer-order.css"
import { createRoot } from "react-dom/client"

import { App } from "./app.tsx"
import { loadAppearanceColorOverride } from "./domain/appearance-color.ts"
import { loadMarkdown } from "./features/report/markdown.tsx"
import { loadTaskBody } from "./features/task-board/deferred-task-body.tsx"
import { applyAppearanceColorOverride } from "./stores/appearance-color-root.ts"
import { reportBrowserError } from "./stores/browser-error-report.ts"
// ページ全体の下地（トークン・body・要素への規則）。
import "./styles/theme.css"
import {
  isTemporalSupported,
  showUnsupportedBrowserNotice,
} from "./utils/check-temporal-support.ts"

const appRoot = document.querySelector("#app")

// Temporal を持たないブラウザでは案内だけを出し、描画の続き（時計を読む処理）には進まない。
if (!isTemporalSupported(globalThis)) {
  if (appRoot !== null) {
    showUnsupportedBrowserNotice(appRoot)
  }
} else {
  // 保存済みの画面の色を `documentElement` へ反映する1回。
  // 最初の描画より前に差す必要があるので、色を持つ部品（帯の歯車）の初期化には任せない。
  // 任せると、保存した色が一瞬だけ既定で描かれてから入れ替わる。
  applyAppearanceColorOverride(loadAppearanceColorOverride())

  window.addEventListener("error", (event) => {
    reportBrowserError("onerror", event.error)
  })
  window.addEventListener("unhandledrejection", (event) => {
    reportBrowserError("unhandledrejection", event.reason)
  })

  // 最初のレポートとタスクの本文を出す前に読み終えるよう、描き始める前に起こす。
  void loadMarkdown()
  void loadTaskBody()

  if (appRoot !== null) {
    createRoot(appRoot, {
      onUncaughtError: (error) => {
        reportBrowserError("render-failure", error)
      },
    }).render(<App />)
  }
}
