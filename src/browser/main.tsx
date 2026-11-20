// ブラウザ側の入口。
// `vite build`（Vite の設定の `input`）がここから辿って、スクリプトと CSS を1回の組み立てで束ねる。
// 副作用（`createRoot(...).render(...)`）を持つのはここと、最初に import する zod の設定だけ。
// 中身は `<App>` で、ここは描き始める前の1回と mount だけを持つ。

// zod のスキーマが作られる前に評価されないと効かないので、ほかのどの import よりも前に置く。
import "./lib/zod-jitless.ts"
// 層の順の宣言。ほかの CSS より先に評価されないと順が決まらないので、`App` の import より前に置く。
import "./styles/layer-order.css"
import { createRoot } from "react-dom/client"

import { GEAR_PREFERENCE_SEED_ELEMENT_ID } from "../shared/session/gear-preference.ts"
import { App } from "./app.tsx"
import { planGearPreferenceMigration } from "./domain/gear-preference-migration.ts"
import { parseGearPreferenceSeed } from "./domain/gear-preference-seed.ts"
import { loadMarkdown } from "./features/report/markdown.tsx"
import { loadTaskBody } from "./features/task-board/deferred-task-body.tsx"
import { reportBrowserError } from "./stores/browser-error-report.ts"
import {
  holdMigratingGearPreferences,
  readLegacyGearPreferences,
  removeLegacyGearPreferences,
} from "./stores/gear-preference-legacy.ts"
import { applyGearPreferences } from "./stores/gear-preference-root.ts"
import { currentGearPreferences, holdGearPreferenceSeed } from "./stores/gear-preference-seed.ts"
import { followOsMotionPreference } from "./stores/motion-preference-root.ts"
// ページ全体の下地（トークン・body・要素への規則）。
import "./styles/theme.css"
import "./styles/reduced-motion.css"
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
  // 覚えた画面の色を `documentElement` へ反映する1回。値はページに焼かれた塊から同期で読む。
  // 最初の描画より前に差す必要があるので、色を持つ部品（帯の歯車）の初期化には任せない。
  // 任せると、覚えた色が一瞬だけ既定で描かれてから入れ替わる。
  // `localStorage` に持っていたころの値は、`state.json` に無い欄だけここで描き始める値にし、サーバへは最初の `hello` で写す。
  const seed = parseGearPreferenceSeed(
    document.getElementById(GEAR_PREFERENCE_SEED_ELEMENT_ID)?.textContent ?? undefined,
  )
  const migration = planGearPreferenceMigration(seed.stored, readLegacyGearPreferences())
  holdGearPreferenceSeed(seed)
  holdMigratingGearPreferences(migration.toSend)
  removeLegacyGearPreferences(migration.removeNow)
  applyGearPreferences(currentGearPreferences())
  followOsMotionPreference(() => currentGearPreferences().motionPreference)

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
