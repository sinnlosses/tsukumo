// 画面全体の部品（`<App>`）。Provider を重ね、その内側で出す画面を選ぶ `<Root>` を描くだけ。

import { QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement } from "react"

import { Root } from "./components/app/root.tsx"
import { queryClient } from "./domain/query-client.ts"

export function App(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  )
}
