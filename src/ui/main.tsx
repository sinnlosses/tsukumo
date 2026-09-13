// ブラウザ側の入口。**`bun build src/ui/main.tsx --target=browser` がここから辿って束ねる**
// （tsconfig の `"jsx": "react-jsx"`）。副作用（`createRoot(...).render(...)`）を持つのは
// ここだけ（`docs/architecture.md`「入口だけに副作用を置く」）。
//
// **移行の段6で `<div id="app">` に1つの root をまとめた**（段3〜5は `.layout-sidebar` 等の
// 複数の root だった。docs/design.md 12章）。領域の組み立て（`<Layout>` に4領域を渡す）は
// `ui/<領域>/` をまたいで import してよい**この入口の役目**（各領域は互いを import しない。
// `test/architecture.test.ts`「ui/ の領域どうしの import」）。

import { createRoot } from "react-dom/client"

import { App } from "./app.tsx"
import { CharacterView } from "./character-view/character-view.tsx"
import { Dispatch } from "./dispatch/dispatch.tsx"
import { Layout } from "./layout/layout.tsx"
import { MainView } from "./main-view/main-view.tsx"
import { Sidebar } from "./sidebar/sidebar.tsx"

const appRoot = document.querySelector("#app")
if (appRoot !== null) {
  createRoot(appRoot).render(
    <App>
      <Layout
        main={<MainView />}
        sidebar={<Sidebar />}
        character={<CharacterView />}
        dispatch={<Dispatch />}
      />
    </App>,
  )
}
