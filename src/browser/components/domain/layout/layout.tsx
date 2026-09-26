// **画面共通の枠**（frame。docs/design.md 2章「領域の機能と、置かれる機能」）。全画面の最上部に
// 画面のナビの帯を置き、その下に画面を差し込む。差し込み口（`nav` / `screen`）は props で受け、
// **どちらも `ReactNode` のまま**——どの画面を出すか・帯に何を乗せるかは知らない
// （`components/app/root.tsx` の `<Root>` が選ぶ。もとは `<Root>` に直接書かれていた組み立てをここへ出した）。
//
// **フックも算出も持たない**（受け取った2つをただ並べるだけなので、`presentational-*` /
// `hooks/` には割らない。`components/domain/sidebar/sidebar.tsx` がストアだけ読んで割っていない
// のと同じ判断）。**他の枠（`screen-nav` など）を import しない**——帯は `<Root>` が組み立てて
// `nav` に渡す（`test/architecture.test.ts`「枠どうしは import しない」）。
//
// 会話の画面の4領域（メイン・サイドバー・キャラビュー・入力欄）はここではなく、会話の画面の部品
// `components/page/conversation/components/conversation-layout/`（`<ConversationLayout>`）にある。

import { type ReactElement, type ReactNode } from "react"

export type LayoutProps = {
  readonly nav: ReactNode
  readonly screen: ReactNode
}

export function Layout({ nav, screen }: LayoutProps): ReactElement {
  return (
    <>
      {nav}
      {screen}
    </>
  )
}
