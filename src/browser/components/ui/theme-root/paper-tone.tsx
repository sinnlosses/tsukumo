// 紙を夜か昼のテーマで包む部品。根の `ThemeRoot` の下に同じテーマを重ね、`color-scheme` だけを替える。

import { Theme } from "@astryxdesign/core/theme"
import type { ReactElement, ReactNode } from "react"

import { tsukumoTheme } from "./built/tsukumo.js"

export type PaperToneName = "night" | "day"

export type PaperToneProps = {
  readonly tone: PaperToneName
  readonly children: ReactNode
}

const THEME_MODE = {
  night: "dark",
  day: "light",
} as const satisfies Record<PaperToneName, "dark" | "light">

export function PaperTone(props: PaperToneProps): ReactElement {
  return (
    <Theme theme={tsukumoTheme} mode={THEME_MODE[props.tone]}>
      {props.children}
    </Theme>
  )
}
