// 別の窓の tsukumo がいま開いているセッションのIDを、手続き `sessionClaim.occupied` で取りに行く。
//
// 聞くのは切り替え画面を開いているあいだだけで、開くたびに取り直す（`staleTime: 0`）。
// 届く前・読めなかったときは空で、画面は待たない（届く前に選ばれたぶんは、起こす直前にサーバが断る）。

import { useQuery } from "@tanstack/react-query"

import { rpc } from "../../../../domain/rpc.ts"

export function useOccupiedSessions(open: boolean): ReadonlySet<string> {
  const { data } = useQuery(
    rpc.sessionClaim.occupied.queryOptions({
      enabled: open,
      staleTime: 0,
      retry: false,
    }),
  )
  return new Set(data ?? [])
}
