// ブラウザ側の入口。**`bun build src/ui/main.tsx --target=browser` がここから辿って束ねる**
// （tsconfig の `"jsx": "react-jsx"`）。副作用（`createRoot(...).render(...)`）を持つのは
// ここだけ（`docs/architecture.md`「入口だけに副作用を置く」と同じ考え方。
// `src/presentation/browser/main.ts` と対）。
//
// **段3でサイドバー、段4で入力欄、段5でキャラビューを移した。** `.layout-sidebar` /
// `.layout-dispatch` / `.layout-character` から旧の HTML と購読を外し、ここに React の root を
// mount する（残る1領域・メインビューはまだ旧のまま。docs/design.md 12章）。

import { createRoot } from "react-dom/client"

import { App } from "./app.tsx"
import { CharacterView } from "./character-view/character-view.tsx"
import { Dispatch } from "./dispatch/dispatch.tsx"
import { Sidebar } from "./sidebar/sidebar.tsx"

const sidebarRegion = document.querySelector(".layout-sidebar")
if (sidebarRegion !== null) {
  createRoot(sidebarRegion).render(
    <App>
      <Sidebar />
    </App>,
  )
}

const dispatchRegion = document.querySelector(".layout-dispatch")
if (dispatchRegion !== null) {
  createRoot(dispatchRegion).render(
    <App>
      <Dispatch />
    </App>,
  )
}

const characterRegion = document.querySelector(".layout-character")
if (characterRegion !== null) {
  createRoot(characterRegion).render(
    <App>
      <CharacterView />
    </App>,
  )
}
