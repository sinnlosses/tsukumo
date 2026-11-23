// 地図の全体の図（縮尺が大）を引く。サイドバーのタブの出し分けと、地図のタブの中身が同じ問い合わせを共有する。

import { useQuery } from "@tanstack/react-query"

import type { MapViewResponse } from "../../../shared/architecture-map/map-view.ts"
import { rpc } from "../../stores/rpc.ts"

/** 届く前・取れなかったときは `pending`。 */
export function useArchitectureMapOverview(): MapViewResponse | { readonly kind: "pending" } {
  const { data } = useQuery(
    rpc.architectureMap.view.queryOptions({
      input: { kind: "level", level: 1 },
      retry: false,
    }),
  )
  return data ?? { kind: "pending" }
}
