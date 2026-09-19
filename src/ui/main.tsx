// ブラウザ側の入口。**`bun build src/ui/main.tsx --target=browser` がここから辿って束ねる**
// （tsconfig の `"jsx": "react-jsx"`）。**CSS もここから辿る**（下の `styles/theme.css` と、
// 各機能が import する `*.module.css`）ので、スクリプトと CSS は1回の組み立てから出る対になる
// （`src/adapter/bundle.ts`）。副作用（`createRoot(...).render(...)`）を持つのは
// ここだけ（`docs/architecture.md`「入口だけに副作用を置く」）。
//
// **選んでいるターンは `<TurnSelectionProvider>` が配る**（メインビューのタブとキャラビューの
// 吹き出しが同じ選択に従うため。`src/ui/stores/turn-selection.tsx`）。
//
// **移行の段6で `<div id="app">` に1つの root をまとめた**（段3〜5は `.layout-sidebar` 等の
// 複数の root だった。docs/design.md 12章）。機能の組み立て（`<Layout>` に4領域を渡す）は
// `ui/features/` をまたいで import してよい**この入口の役目**
// （機能どうしは互いを import しない。`test/architecture.test.ts`「ui/ の機能どうしの import」）。
//
// **出す画面を選ぶのも入口の役目**（`<Root>`。docs/design.md 6.1 / 13.6）。`<Layout>` は
// 他の機能を知らないので、画面の入れ替えを機能の側に持たせると機能どうしの import になる。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ReactElement } from "react"
import { createRoot } from "react-dom/client"

import {
  applyAppearanceColorOverride,
  loadAppearanceColorOverride,
} from "./features/character-screen/appearance-color.ts"
import { CharacterCreate } from "./features/character-screen/character-create.tsx"
import { CharacterScreen } from "./features/character-screen/character-screen.tsx"
import { CharacterView } from "./features/character-view/character-view.tsx"
import { Dispatch } from "./features/dispatch/dispatch.tsx"
import { Layout } from "./features/layout/layout.tsx"
import { MainView } from "./features/main-view/main-view.tsx"
import { Sidebar } from "./features/sidebar/sidebar.tsx"
import { useScreen } from "./stores/screen.tsx"
import { SessionProvider } from "./stores/session.tsx"
import { TurnSelectionProvider } from "./stores/turn-selection.tsx"
// ページ全体の下地（トークン・body・リンク）。**グローバルな CSS はこれだけ**で、機能ごとの
// 見た目は各機能の `*.module.css` にある（docs/design.md 6.6）。
import "./styles/theme.css"

/**
 * 出している画面を選ぶ（`location.hash`。docs/design.md 13.6）。**会話の画面は外さず
 * `hidden` で隠す** — 入力欄の下書き・選んでいるターン・スクロール位置はどれも部品の
 * ローカル状態なので、外すと戻ったときに失われる（`<SessionProvider>` はこの上に居るので
 * 会話そのものは隠れている間も進み続ける）。
 */
function Root(): ReactElement {
  const screen = useScreen()
  return (
    <>
      <div hidden={screen !== "conversation"}>
        <Layout
          main={<MainView />}
          sidebar={<Sidebar />}
          character={<CharacterView />}
          dispatch={<Dispatch />}
        />
      </div>
      {screen === "character" ? <CharacterScreen /> : null}
      {screen === "character-create" ? <CharacterCreate /> : null}
    </>
  )
}

// 保存済みの画面の色を `documentElement` へ反映する1回。**キャラクター画面は開かれるまで
// マウントされない**ので、色を持つ部品の初期化に任せるとリロード後に色が戻らない。
applyAppearanceColorOverride(loadAppearanceColorOverride())

// 立ち絵の SVG 取得（`components/portrait.tsx`）が使う。**キャッシュの既定値は個々の
// `useQuery` 側**（URL がパックの版を含むので、取り直す条件は呼び出し側にしか分からない）。
const queryClient = new QueryClient()

const appRoot = document.querySelector("#app")
if (appRoot !== null) {
  createRoot(appRoot).render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <TurnSelectionProvider>
          <Root />
        </TurnSelectionProvider>
      </SessionProvider>
    </QueryClientProvider>,
  )
}
