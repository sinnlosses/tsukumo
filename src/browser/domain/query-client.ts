// 画面の外（フレームを捌く側）からもキャッシュを触れるよう、`QueryClient` はモジュールに1つ置く。

import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()
