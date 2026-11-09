// 画面全体を Astryx のテーマ（tsukumo）と日本語の文言で包む根の部品。

import "@astryxdesign/core/astryx.css"
import { InternationalizationProvider } from "@astryxdesign/core/i18n"
import jaJP from "@astryxdesign/core/locales/ja-JP.generated.js"
import { Theme } from "@astryxdesign/core/theme"
import type { ReactElement, ReactNode } from "react"

import "./built/tsukumo.css"
import { tsukumoTheme } from "./built/tsukumo.js"

export type ThemeRootProps = {
  readonly children: ReactNode
}

export function ThemeRoot(props: ThemeRootProps): ReactElement {
  return (
    <InternationalizationProvider locale="ja-JP" messages={{ "ja-JP": jaJP }}>
      <Theme theme={tsukumoTheme} mode="dark">
        {props.children}
      </Theme>
    </InternationalizationProvider>
  )
}
