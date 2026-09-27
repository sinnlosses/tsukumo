// 部品とフックのテストが TanStack Query の下で描くための `QueryClient`。
// 失敗した取得を打ち直さないので、失敗の場面がすぐに画面へ出る。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement, ReactNode } from "react"

export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/** `renderHook` / `render` の `wrapper` に渡す、`client` を配る部品。 */
export function queryClientWrapper(
  client: QueryClient = createTestQueryClient(),
): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}
