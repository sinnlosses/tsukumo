// `ui/note` の `ask` の種類。Astryx の Banner に疑問の種類が無いので足す。値は `styles/theme.css` のトークンの `var()` だけにする。

import type { ComponentStyleMap } from "@astryxdesign/core/theme"

export const tsukumoBannerOverride = {
  banner: {
    "status:ask": {
      backgroundColor: "color-mix(in srgb, var(--surface), var(--state-ask) 18%)",
    },
  },
} satisfies ComponentStyleMap
