// ブラウザ側の入口。**`bun build src/browser/main.tsx --target=browser` がここから辿って束ねる**
// （tsconfig の `"jsx": "react-jsx"`）。**CSS もここから辿る**（下の `styles/theme.css` と、
// 各機能が import する `*.module.css`）ので、スクリプトと CSS は1回の組み立てから出る対になる
// （`src/server/adapter/bundle.ts`）。副作用（`createRoot(...).render(...)`）を持つのは
// ここだけ（`docs/architecture.md`「入口だけに副作用を置く」）。
//
// **選んでいるターンは `<TurnSelectionProvider>` が配る**（メインビューのタブとキャラビューの
// 吹き出しが同じ選択に従うため。`src/browser/stores/turn-selection.tsx`）。
//
// **移行の段6で `<div id="app">` に1つの root をまとめた**（段3〜5は `.layout-sidebar` 等の
// 複数の root だった。段の記録は `docs/history/decision.md`「design.md 12. 移行の段階」）。
// 機能の組み立て（`<Layout>` に4領域を渡す）は
// `browser/features/` をまたいで import してよい**この入口の役目**
// （機能どうしは互いを import しない。`test/architecture.test.ts`「browser/ の機能どうしの import」）。
//
// **出す画面を選ぶのも入口の役目**（`<Root>`。docs/design.md 6.1 / 13.6）。`<Layout>` は
// 他の機能を知らないので、画面の入れ替えを機能の側に持たせると機能どうしの import になる。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Activity, type ReactElement } from "react"
import { createRoot } from "react-dom/client"

import {
  applyAppearanceColorOverride,
  loadAppearanceColorOverride,
} from "./features/character-screen/appearance-color.ts"
import { CharacterCreate } from "./features/character-screen/character-create.tsx"
import { CharacterScreen } from "./features/character-screen/character-screen.tsx"
import { CharacterView } from "./features/character-view/character-view.tsx"
import { ChatView } from "./features/chat-view/chat-view.tsx"
import { Dispatch } from "./features/dispatch/dispatch.tsx"
import { Layout } from "./features/layout/layout.tsx"
import { MainView } from "./features/main-view/main-view.tsx"
import { Sidebar } from "./features/sidebar/sidebar.tsx"
import { QuestionFocusProvider } from "./stores/question-focus.tsx"
import { useScreen } from "./stores/screen.tsx"
import { SessionProvider, useSessionSelector } from "./stores/session.tsx"
import { TurnSelectionProvider } from "./stores/turn-selection.tsx"
// ページ全体の下地（トークン・body・リンク）。**グローバルな CSS はこれだけ**で、機能ごとの
// 見た目は各機能の `*.module.css` にある（docs/design.md 6.6）。
import "./styles/theme.css"

/**
 * 出している画面を選ぶ（`location.hash`。docs/design.md 13.6）。**会話の画面は外さず
 * `<Activity mode="hidden">` で隠す** — 入力欄の下書き・選んでいるターン・スクロール位置は
 * どれも部品のローカル状態なので、外すと戻ったときに失われる（`<SessionProvider>` はこの上に
 * 居るので会話そのものは隠れている間も進み続ける）。`hidden` 属性と違い描画も止まるので、
 * キャラクター画面を開いている間の再描画が減る。
 */
function Root(): ReactElement {
  const screen = useScreen()
  // **雑談モードではメインビューを雑談ビューに差し替え、キャラビューを畳む**
  // （立ち絵が上段へ移るため。docs/requirements.md 4.9 / docs/design.md 13.7）。
  // 差し替えを入口が持つのは、`<Layout>` が他の機能を知らないのと同じ理由。
  // **同時にメインの領域を地そのものにする**（枠と角丸が外れ、背景がそこへ移る。13.8）。
  // 「いま雑談か」を知っているのはここだけなので、`<Layout>` には2つの旗を別々に渡す
  // （畳むことと枠を外すことは別の話で、片方だけが要る形もありうる）。
  const chatMode = useSessionSelector((session) => session.state.chatMode)
  return (
    <>
      <Activity mode={screen === "conversation" ? "visible" : "hidden"}>
        <Layout
          main={chatMode ? <ChatView /> : <MainView />}
          sidebar={<Sidebar />}
          character={<CharacterView />}
          dispatch={<Dispatch />}
          collapseCharacter={chatMode}
          mainAsGround={chatMode}
        />
      </Activity>
      {screen === "character" ? <CharacterScreen /> : null}
      {screen === "character-create" ? <CharacterCreate /> : null}
    </>
  )
}

// 保存済みの画面の色を `documentElement` へ反映する1回。**キャラクター画面は開かれるまで
// マウントされない**ので、色を持つ部品の初期化に任せるとリロード後に色が戻らない。
applyAppearanceColorOverride(loadAppearanceColorOverride())

// 立ち絵の SVG 取得（`components/portrait.tsx`）と入力欄の `@` 補完のファイル一覧
// （`features/dispatch/file-suggestions.tsx`）が使う。**キャッシュの既定値は個々の
// `useQuery` 側**（取り直す条件は呼び出し側にしか分からない）。
const queryClient = new QueryClient()

const appRoot = document.querySelector("#app")
if (appRoot !== null) {
  createRoot(appRoot).render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <TurnSelectionProvider>
          {/* 答え待ちの質問の「何問目・どの選択肢に目を置いているか」は、入力欄の箱と
              メインビューの比較の両方が読む（`stores/question-focus.tsx`）。 */}
          <QuestionFocusProvider>
            <Root />
          </QuestionFocusProvider>
        </TurnSelectionProvider>
      </SessionProvider>
    </QueryClientProvider>,
  )
}
