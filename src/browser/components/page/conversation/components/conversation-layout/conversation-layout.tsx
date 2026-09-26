// 会話の画面の4領域のレイアウト（`<ConversationLayout>`。docs/design.md 6.1）の入口。ロジック
// （3本の仕切りの比率・狭い画面のタブ）は `hooks/use-conversation-layout.ts` が持ち、見た目は
// `presentational-conversation-layout.tsx` が持つ（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。
//
// もとは静的な HTML の組み立てとブラウザ側の配線に分かれていた処理だった（移行の段6で
// React の部品にし、段3〜5の複数の root を1つにまとめた。段の記録は
// `docs/history/decision.md`「design.md 12. 移行の段階」）。
//
// 領域の中身（`<MainView>` / `<Sidebar>` / `<CharacterView>` / `<Dispatch>`）は props で
// 受け取る。 ここから他の `features/` を import しない（`test/architecture.test.ts`
// 「browser/ の機能どうしの import」）。差し込み口を埋めて組み立てるのは会話の画面の器
// `presentational-conversation.tsx`（画面共通の枠 `components/domain/layout/` はここではなく
// 帯とページの差し込み口だけを持つ別物。docs/design.md 2章「領域の機能と、置かれる機能」）。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。条件分岐も算出もここには
// 置かない（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement, type ReactNode } from "react"

import { useConversationLayout } from "./hooks/use-conversation-layout.ts"
import { PresentationalConversationLayout } from "./presentational-conversation-layout.tsx"

export type ConversationLayoutProps = {
  readonly main: ReactNode
  readonly sidebar: ReactNode
  readonly character: ReactNode
  readonly dispatch: ReactNode
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
