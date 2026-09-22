// レイアウト全体（`<Layout>`。docs/design.md 6.1）の**入口**。ロジック（3本の仕切りの比率・
// 狭い画面のタブ）は `hooks/use-layout.ts` が持ち、見た目は `presentational-layout.tsx` が持つ
// （docs/design.md 2章「機能の中を分ける」の container / presenter）。
//
// もとは静的な HTML の組み立てとブラウザ側の配線に分かれていた処理だった（移行の段6で
// React の部品にし、段3〜5の複数の root を1つにまとめた。段の記録は
// `docs/history/decision.md`「design.md 12. 移行の段階」）。
//
// **領域の中身（`<MainView>` / `<Sidebar>` / `<CharacterView>` / `<Dispatch>`）は props で
// 受け取る。** ここから他の `features/` を import しない（`test/architecture.test.ts`
// 「browser/ の機能どうしの import」）。組み立てるのは入口の `src/browser/main.tsx`。
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement, type ReactNode } from "react"

import { useLayout } from "./hooks/use-layout.ts"
import { PresentationalLayout } from "./presentational-layout.tsx"

export type LayoutProps = {
  readonly main: ReactNode
  readonly sidebar: ReactNode
  readonly character: ReactNode
  readonly dispatch: ReactNode
  readonly collapseCharacter: boolean
  readonly mainAsGround: boolean
}

export function Layout(props: LayoutProps): ReactElement {
  const view = useLayout(props.collapseCharacter)

  return (
    <PresentationalLayout
      main={props.main}
      sidebar={props.sidebar}
      character={props.character}
      dispatch={props.dispatch}
      collapseCharacter={props.collapseCharacter}
      mainAsGround={props.mainAsGround}
      {...view}
    />
  )
}
