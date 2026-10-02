// 会話の画面の4領域のレイアウトの入口。
//
// 領域の中身（`<MainView>` / `<Sidebar>` / `<CharacterView>` / `<Dispatch>`）は props で受け取る。
// ここから他の機能を import しない（構造の検査「browser/ の機能どうしの import」が落とす）。

import type { ReactElement, ReactNode } from "react"

import { useConversationLayout } from "./hooks/use-conversation-layout.ts"
import { PresentationalConversationLayout } from "./presentational-conversation-layout.tsx"

export type ConversationLayoutProps = {
  readonly main: ReactNode
  readonly sidebar: ReactNode
  readonly character: ReactNode
  readonly dispatch: ReactNode
  readonly railBadge: ReactNode
  readonly railTools: ReactNode
  readonly collapseCharacter: boolean
  readonly mainAsGround: boolean
}

export function ConversationLayout(props: ConversationLayoutProps): ReactElement {
  return (
    <PresentationalConversationLayout
      {...props}
      {...useConversationLayout(props.collapseCharacter)}
    />
  )
}
