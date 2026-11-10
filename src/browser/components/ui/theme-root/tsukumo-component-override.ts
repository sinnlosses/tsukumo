// Astryx の部品に口が無いものをテーマで足す。値は `styles/theme.css` のトークンの `var()` だけにする。

import type { ComponentStyleMap } from "@astryxdesign/core/theme"

const stateColors = {
  "color:state-ok": { color: "var(--state-ok)" },
  "color:state-warn": { color: "var(--state-warn)" },
  "color:state-ng": { color: "var(--state-ng)" },
  "color:state-ask": { color: "var(--state-ask)" },
}

export const tsukumoComponentOverride = {
  text: {
    base: { margin: "0" },
    ...stateColors,
  },
  heading: {
    base: { margin: "0" },
    ...stateColors,
  },
} satisfies ComponentStyleMap
