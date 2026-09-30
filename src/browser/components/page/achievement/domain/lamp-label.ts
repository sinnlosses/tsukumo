import type { LampLevel } from "../../../../../shared/achievement/achievement-calendar.ts"

/** 灯りの段階の呼び名。 */
export const LAMP_LABEL = {
  none: "灯りなし",
  faint: "ほのか",
  lit: "ともる",
  bright: "明るい",
} as const satisfies Record<LampLevel, string>
