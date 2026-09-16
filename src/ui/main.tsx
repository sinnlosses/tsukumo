// ブラウザ側の入口。**`bun build src/ui/main.tsx --target=browser` がここから辿って束ねる**
// （tsconfig の `"jsx": "react-jsx"`）。副作用（`createRoot(...).render(...)`）を持つのは
// ここだけ（`docs/architecture.md`「入口だけに副作用を置く」）。
//
// **選んでいるターンは `<TurnSelectionProvider>` が配る**（メインビューのタブとキャラビューの
// 吹き出しが同じ選択に従うため。`src/ui/stores/turn-selection.tsx`）。
//
// **移行の段6で `<div id="app">` に1つの root をまとめた**（段3〜5は `.layout-sidebar` 等の
// 複数の root だった。docs/design.md 12章）。機能の組み立て（`<Layout>` に4領域と
// `<Appearance>` を渡す）は `ui/features/` をまたいで import してよい**この入口の役目**
// （機能どうしは互いを import しない。`test/architecture.test.ts`「ui/ の機能どうしの import」）。

import { createRoot } from "react-dom/client"

import { Appearance } from "./features/appearance/appearance.tsx"
import { CharacterView } from "./features/character-view/character-view.tsx"
import { Dispatch } from "./features/dispatch/dispatch.tsx"
import { Layout } from "./features/layout/layout.tsx"
import { MainView } from "./features/main-view/main-view.tsx"
import { Sidebar } from "./features/sidebar/sidebar.tsx"
import { SessionProvider } from "./stores/session.tsx"
import { TurnSelectionProvider } from "./stores/turn-selection.tsx"

const appRoot = document.querySelector("#app")
if (appRoot !== null) {
  createRoot(appRoot).render(
    <SessionProvider>
      <TurnSelectionProvider>
        <Layout
          main={<MainView />}
          sidebar={<Sidebar />}
          character={<CharacterView />}
          dispatch={<Dispatch />}
          renderAppearance={(onResetSplit) => <Appearance onResetSplit={onResetSplit} />}
        />
      </TurnSelectionProvider>
    </SessionProvider>,
  )
}
