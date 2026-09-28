// 画面のナビの帯の入口。全画面の最上部の1本の帯から、画面どうしを行き来する。
// 帯は会話の画面だけのものではないので、`<ConversationLayout>` の中ではなく `<Layout>` に置く。

import type { ReactElement } from "react"

import { useScreenNav } from "./hooks/use-screen-nav.ts"
import { PresentationalScreenNav } from "./presentational-screen-nav.tsx"

export function ScreenNav(): ReactElement {
  return <PresentationalScreenNav {...useScreenNav()} />
}
