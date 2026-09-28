// 画面全体の部品（`<App>`）。Provider を重ね、その内側で出す画面を選ぶ `<Root>` を描くだけ。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement } from "react"

import { Root } from "./components/app/root.tsx"

export function App(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  )
}

// キャッシュの既定値はここで決めず、個々の `useQuery` に置く（取り直す条件は呼び出し側にしか分からない）。
const queryClient = new QueryClient()
