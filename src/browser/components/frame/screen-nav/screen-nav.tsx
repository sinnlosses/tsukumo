// 画面のナビの帯の入口。全画面の最上部の1本の帯から、画面どうしを行き来する。
// 帯は会話の画面だけのものではないので、`<ConversationLayout>` の中ではなく `<Layout>` に置く。
//
// 狭い画面の引き出しに入る中身のうち、サイドバーと会話の画面の部品は `<Layout>` から差し込み口（`drawer`）で受ける。

import type { ReactElement } from "react"

import type { NavDrawerSlots } from "./components/nav-drawer.tsx"
import { useScreenNav } from "./hooks/use-screen-nav.ts"
import { PresentationalScreenNav } from "./presentational-screen-nav.tsx"

export function ScreenNav(props: { readonly drawer: NavDrawerSlots }): ReactElement {
  return <PresentationalScreenNav {...useScreenNav()} slots={props.drawer} />
}
