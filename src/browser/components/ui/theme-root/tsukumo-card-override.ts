// `ui/surface` の `accent` の地。Astryx の Card に差し色の variant が無いので足す。値は `styles/theme.css` のトークンの `var()` だけにする。

import type { ComponentStyleMap } from "@astryxdesign/core/theme"

export const tsukumoCardOverride = {
  card: {
    "variant:accent": {
      backgroundColor: "var(--surface-accent)",
    },
  },
} satisfies ComponentStyleMap
