// `ui/dialog` の `clear`（覆いで暗くしない）。Astryx の Dialog に口が無いので variant で足す。値は `styles/theme.css` のトークンの `var()` だけにする。

import type { ComponentStyleMap } from "@astryxdesign/core/theme"

export const tsukumoDialogOverride = {
  dialog: {
    "variant:clear": {
      "::backdrop": { backgroundColor: "transparent" },
    },
  },
} satisfies ComponentStyleMap
