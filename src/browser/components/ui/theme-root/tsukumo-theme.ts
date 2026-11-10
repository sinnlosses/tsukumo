// Astryx のテーマの定義。値は `styles/theme.css` のトークンの `var()` と、それを組んだ式だけにする。
// `astryx theme build` の入力で、実行時には読まない（読むのは `built/` の組み立て物）。

import {
  defineTheme,
  type ThemeAdaptations,
  type TokenName,
  type TokenValue,
} from "@astryxdesign/core/theme"
import { neutralTheme } from "@astryxdesign/theme-neutral"

const stateMuted = (state: string): string =>
  `color-mix(in srgb, var(--surface), var(${state}) 13%)`

const stateRing = (state: string): string =>
  `inset 0 0 0 var(--space-2xs) color-mix(in srgb, var(${state}) 30%, transparent)`

const inkTint = (percent: number): string =>
  `color-mix(in srgb, var(--ink) ${String(percent)}%, transparent)`

// neutral は触る画面で `lg` より狭いときに字の段を組み直すので、本文の行の高さも同じ条件で書き直す。
const readingLeadingTokens = {
  "--text-body-leading": "var(--line-height-reading)",
} satisfies Partial<Record<TokenName, TokenValue>>

const tsukumoTokens = {
  "--color-background-body": "var(--ground)",
  "--color-background-muted": "var(--ground)",
  "--color-background-surface": "var(--surface)",
  "--color-background-card": "var(--surface)",
  "--color-background-popover": "var(--surface)",

  "--color-text-primary": "var(--ink)",
  "--color-text-secondary": "var(--ink-soft)",
  "--color-text-disabled": "var(--ink-quiet)",
  "--color-text-accent": "var(--accent)",
  "--color-text-success": "var(--state-ok)",
  "--color-text-warning": "var(--state-warn)",
  "--color-text-error": "var(--state-ng)",
  "--color-text-info": "var(--state-info)",
  "--color-on-success-muted": "var(--state-ok)",
  "--color-on-warning-muted": "var(--state-warn)",
  "--color-on-error-muted": "var(--state-ng)",
  "--color-on-info-muted": "var(--state-info)",
  "--color-icon-primary": "var(--ink)",
  "--color-icon-secondary": "var(--ink-soft)",
  "--color-icon-disabled": "var(--ink-quiet)",
  "--color-icon-accent": "var(--accent)",
  "--color-icon-success": "var(--state-ok)",
  "--color-icon-warning": "var(--state-warn)",
  "--color-icon-error": "var(--state-ng)",
  "--color-icon-info": "var(--state-info)",

  "--color-border": "var(--rule-quiet)",
  "--color-border-emphasized": "var(--rule)",

  "--color-accent": "var(--accent)",
  "--color-accent-muted": "var(--surface-accent)",
  "--color-on-accent": "var(--ground)",

  "--color-success": "var(--state-ok)",
  "--color-warning": "var(--state-warn)",
  "--color-error": "var(--state-ng)",
  "--color-info": "var(--state-info)",
  "--color-success-muted": stateMuted("--state-ok"),
  "--color-warning-muted": stateMuted("--state-warn"),
  "--color-error-muted": stateMuted("--state-ng"),
  "--color-info-muted": stateMuted("--state-info"),

  "--color-overlay": "color-mix(in srgb, var(--ground) 80%, transparent)",
  "--color-overlay-hover": inkTint(5),
  "--color-overlay-pressed": inkTint(10),
  "--color-tint-hover": "var(--ink)",
  "--color-neutral": inkTint(10),

  "--font-family-code": "var(--font-code)",

  ...readingLeadingTokens,

  "--shadow-inset-selected": "inset var(--shadow-ring)",
  "--shadow-inset-success": stateRing("--state-ok"),
  "--shadow-inset-warning": stateRing("--state-warn"),
  "--shadow-inset-error": stateRing("--state-ng"),
} satisfies Partial<Record<TokenName, TokenValue>>

const tsukumoAdaptations = {
  rules: [
    {
      when: { pointer: "coarse", width: { below: "lg" } },
      value: { tokens: readingLeadingTokens },
    },
  ],
} satisfies ThemeAdaptations

export const tsukumoTheme = defineTheme({
  name: "tsukumo",
  extends: neutralTheme,
  tokens: tsukumoTokens,
  adaptations: tsukumoAdaptations,
})
