// `ui/badge` の色の足し。値は `styles/theme.css` のトークンの `var()` だけにする。
// `accent` は Astryx の Badge に差し色の variant が無いので足す。
// `gray`（中立）は Astryx の既定の地が暗い紙の上で地に溶け、ほかの状態の塗りの印と並ぶと文字だけに見えるので、罫の色の地にする。

import type { ComponentStyleMap } from "@astryxdesign/core/theme"

export const tsukumoBadgeOverride = {
  badge: {
    "variant:accent": {
      backgroundColor: "var(--surface-accent)",
      color: "var(--accent)",
    },
    "variant:gray": {
      backgroundColor: "var(--rule)",
      color: "var(--ink)",
    },
  },
} satisfies ComponentStyleMap
