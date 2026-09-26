// 画面全体の部品（`<App>`）。**Provider を重ね、その内側で出す画面を選ぶ `<Root>` を描くだけ。**
// 入口の `main.tsx` はこれを `createRoot(...).render(...)` するだけ（Vite の流儀と同じ分け方）。
//
// **選んでいるターンは `<TurnSelectionProvider>` が配る**（メインビューのタブとキャラビューの
// 吹き出しが同じ選択に従うため。`src/browser/stores/turn-selection.tsx`）。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ReactElement } from "react"

import { Root } from "./components/app/root.tsx"
import { QuestionAnswerProvider } from "./stores/question-answer.tsx"
import { QuestionScrollProvider } from "./stores/question-scroll.tsx"
import { SessionProvider } from "./stores/session.tsx"
import { TurnSelectionProvider } from "./stores/turn-selection.tsx"

export function App(): ReactElement {
  return (
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
    </QueryClientProvider>
  )
}

// 立ち絵の SVG 取得（`components/domain/portrait.tsx`）と入力欄の `@` 補完のファイル一覧
// （`components/page/conversation/components/dispatch/components/file-suggestions/file-suggestions.tsx`）が使う。**キャッシュの既定値は個々の
// `useQuery` 側**（取り直す条件は呼び出し側にしか分からない）。
const queryClient = new QueryClient()
