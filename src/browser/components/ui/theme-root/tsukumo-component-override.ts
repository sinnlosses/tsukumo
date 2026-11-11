// Astryx の部品に口が無いものをテーマで足す。値は `styles/theme.css` のトークンの `var()` だけにする。

import type { ComponentStyleMap } from "@astryxdesign/core/theme"

import { tsukumoBadgeOverride } from "./tsukumo-badge-override.ts"
import { tsukumoButtonOverride } from "./tsukumo-button-override.ts"
import { tsukumoDialogOverride } from "./tsukumo-dialog-override.ts"

const stateColors = {
  "color:state-ok": { color: "var(--state-ok)" },
  "color:state-warn": { color: "var(--state-warn)" },
  "color:state-ng": { color: "var(--state-ng)" },
  "color:state-ask": { color: "var(--state-ask)" },
}

export const tsukumoComponentOverride = {
  ...tsukumoButtonOverride,
  ...tsukumoBadgeOverride,
  ...tsukumoDialogOverride,
  text: {
    base: { margin: "0" },
    ...stateColors,
  },
  heading: {
    base: { margin: "0" },
    ...stateColors,
  },
} satisfies ComponentStyleMap
