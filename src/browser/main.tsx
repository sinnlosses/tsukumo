// ブラウザ側の入口。**`bun build src/browser/main.tsx --target=browser` がここから辿って束ねる**
// （tsconfig の `"jsx": "react-jsx"`）。**CSS もここから辿る**（下の `styles/theme.css` と、
// 各機能が import する `*.module.css`）ので、スクリプトと CSS は1回の組み立てから出る対になる
// （`src/server/view-server/adapter/bundle.ts`）。副作用（`createRoot(...).render(...)`）を持つのは
// ここだけ（`docs/architecture.md`「各ファイルの責務」）。
//
// **選んでいるターンは `<TurnSelectionProvider>` が配る**（メインビューのタブとキャラビューの
// 吹き出しが同じ選択に従うため。`src/browser/stores/turn-selection.tsx`）。
//
// **移行の段6で `<div id="app">` に1つの root をまとめた**（段3〜5は `.layout-sidebar` 等の
// 複数の root だった。段の記録は `docs/history/decision.md`「design.md 12. 移行の段階」）。
// **出す画面を選ぶのは入口の役目**（`<Root>`。docs/design.md 6.1 / docs/screen-design.md 13.6）。
// 画面どうしは互いを import しないので、画面の入れ替えを画面の側に持たせると画面どうしの
// import になる（`test/architecture.test.ts`「browser/ の機能どうしの import」）。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Activity, type ReactElement } from "react"
import { createRoot } from "react-dom/client"

import { Layout } from "./components/domain/layout/layout.tsx"
import { usePortraitPreload } from "./components/domain/portrait.tsx"
import { ProtocolMismatch } from "./components/domain/protocol-mismatch.tsx"
import { ScreenNav } from "./components/domain/screen-nav/screen-nav.tsx"
import { Achievement } from "./components/page/achievement/achievement.tsx"
import { DiaryNotice } from "./components/page/achievement/components/diary-notice/diary-notice.tsx"
import { Character } from "./components/page/character/character.tsx"
import { Conversation } from "./components/page/conversation/conversation.tsx"
import { TokenUsage } from "./components/page/token-usage/token-usage.tsx"
import {
  applyAppearanceColorOverride,
  loadAppearanceColorOverride,
} from "./domain/appearance-color.ts"
import { type Screen } from "./stores/location-hash.ts"
import { QuestionAnswerProvider } from "./stores/question-answer.tsx"
import { QuestionScrollProvider } from "./stores/question-scroll.tsx"
import { useScreen } from "./stores/screen.tsx"
import { SessionProvider, useSessionSelector } from "./stores/session.tsx"
import { TurnSelectionProvider } from "./stores/turn-selection.tsx"
// ページ全体の下地（トークン・body・リンク）。**グローバルな CSS はこれだけ**で、機能ごとの
// 見た目は各機能の `*.module.css` にある（docs/design.md 6.6）。
import "./styles/theme.css"

/**
 * 会話の画面を除いた画面の部品を引く表（`stores/location-hash.ts` の画面の一覧が正典）。
 * **`satisfies` で `Screen` を尽くしているかを検査する**ので、画面を1つ足したのに部品の登録を
 * 忘れると `bun run typecheck` が落ちる。会話の画面は `<Conversation>` を常時マウントしたまま
 * `<Activity>` の可視/不可視で切り替える別枠（下の {@link Root} 参照）なのでここには乗らない。
 */
const OVERLAY_SCREEN = {
  character: <Character />,
  "token-usage": <TokenUsage />,
  achievement: <Achievement />,
} satisfies Record<Exclude<Screen, "conversation">, ReactElement>

/**
 * 出している画面を選ぶ（`location.hash`。docs/screen-design.md 13.6）。**会話の画面は外さず
 * `<Activity mode="hidden">` で隠す** — 入力欄の下書き・選んでいるターン・スクロール位置は
 * どれも部品のローカル状態なので、外すと戻ったときに失われる（`<SessionProvider>` はこの上に
 * 居るので会話そのものは隠れている間も進み続ける）。`hidden` 属性と違い描画も止まるので、
 * キャラクター画面を開いている間の再描画が減る。
 */
function Root(): ReactElement {
  const screen = useScreen()
  // 切り替えた先の領域で立ち絵が空かないよう、**どちらの画面を出していても**表情の数だけ
  // 先に読んでおく（docs/screen-design.md 13.7「切り替えのときの立ち絵」）。読み手が
  // キャラビューと雑談ビューの2つにまたがり、会話の画面を出していないときも要るので、入口で
  // 1回だけ呼ぶ。
  usePortraitPreload(useSessionSelector((session) => session.state.character?.portraits))
  // サーバと版が合わない間は、どの画面も描かず知らせだけを出す（docs/design.md 4.4）。
  const protocol = useSessionSelector((session) => session.protocol)
  if (protocol === "mismatched") {
    return <ProtocolMismatch />
  }
  return (
    <Layout
      // 画面のナビの帯（13.9）。**どの画面でも最上部に出る**ので、画面を選ぶ分岐の外で組む。
      // 会話の画面の `<ConversationLayout>` は、帯が奪う高さを CSS の変数（theme.css）から読んで
      // 縮む。**枠（`<Layout>`）は帯の中身を知らない**ので、ここで組んでから渡す。
      nav={<ScreenNav />}
      screen={
        <>
          {/* 書き終わりの知らせ（13.10「書き終わりの知らせ」）。**成果の画面でだけ出す**。ほかの
              画面へ移っても「×」で消したかどうかを忘れないよう、外さずに `<Activity>` で隠す。 */}
          <Activity mode={screen === "achievement" ? "visible" : "hidden"}>
            <DiaryNotice />
          </Activity>
          <Activity mode={screen === "conversation" ? "visible" : "hidden"}>
            <Conversation />
          </Activity>
          {screen === "conversation" ? null : OVERLAY_SCREEN[screen]}
        </>
      }
    />
  )
}

// 保存済みの画面の色を `documentElement` へ反映する1回。**最初の描画より前に差す**必要が
// あるので、色を持つ部品（帯の歯車。13.9）の初期化には任せない——任せると、保存した色が
// 一瞬だけ既定で描かれてから入れ替わる。
applyAppearanceColorOverride(loadAppearanceColorOverride())

// 立ち絵の SVG 取得（`components/domain/portrait.tsx`）と入力欄の `@` 補完のファイル一覧
// （`components/page/conversation/components/dispatch/components/file-suggestions/file-suggestions.tsx`）が使う。**キャッシュの既定値は個々の
// `useQuery` 側**（取り直す条件は呼び出し側にしか分からない）。
const queryClient = new QueryClient()

const appRoot = document.querySelector("#app")
if (appRoot !== null) {
  createRoot(appRoot).render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <TurnSelectionProvider>
          {/* 答え待ちの質問に組み立てている答えは、メインビューの札と入力欄の両方が
              読み書きする（`stores/question-answer.tsx`）。 */}
          <QuestionAnswerProvider>
            {/* 帯の「質問へ」からメインビューの質問の札へのスクロールの合図
                （`stores/question-scroll.tsx`）。 */}
            <QuestionScrollProvider>
              <Root />
            </QuestionScrollProvider>
          </QuestionAnswerProvider>
        </TurnSelectionProvider>
      </SessionProvider>
    </QueryClientProvider>,
  )
}
