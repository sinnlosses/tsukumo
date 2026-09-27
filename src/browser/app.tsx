// 画面全体の部品（`<App>`）。Provider を重ね、その内側で出す画面を選ぶ `<Root>` を描くだけ。
// 入口の `main.tsx` はこれを `createRoot(...).render(...)` するだけ（Vite の流儀と同じ分け方）。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ReactElement } from "react"

import { Root } from "./components/app/root.tsx"

export function App(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  )
}

// 立ち絵の SVG 取得（`components/domain/portrait.tsx`）と入力欄の `@` 補完のファイル一覧
// （`components/page/conversation/components/dispatch/components/file-suggestions/file-suggestions.tsx`）が使う。キャッシュの既定値は個々の
// `useQuery` 側（取り直す条件は呼び出し側にしか分からない）。
const queryClient = new QueryClient()
