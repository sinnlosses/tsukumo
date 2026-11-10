// `ui/badge` の `accent` の色。Astryx の Badge に差し色の variant が無いので足す。値は `styles/theme.css` のトークンの `var()` だけにする。

import type { ComponentStyleMap } from "@astryxdesign/core/theme"

export const tsukumoBadgeOverride = {
  badge: {
    "variant:accent": {
      backgroundColor: "var(--surface-accent)",
      color: "var(--accent)",
    },
  },
} satisfies ComponentStyleMap
