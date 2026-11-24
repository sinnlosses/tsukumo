// `ui/button` が使う Button のテーマの足し。Astryx の 4 つの variant に収まらない「警告」の意味と、
// `aria-disabled` で押せなくした見た目を足す。色は `styles/theme.css` のトークンの `var()` だけにする（薄さとカーソルはトークンが無いので直書き）。

import type { ComponentStyleMap } from "@astryxdesign/core/theme"

export const tsukumoButtonOverride = {
  button: {
    base: {
      ':is([aria-disabled="true"])': {
        opacity: "0.5",
        cursor: "not-allowed",
      },
    },
    "variant:warning": {
      backgroundColor: "color-mix(in srgb, var(--surface), var(--state-warn) 13%)",
      color: "var(--state-warn)",
    },
  },
} satisfies ComponentStyleMap
