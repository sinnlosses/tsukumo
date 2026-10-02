// 帯の札の主の字に出す、作業ディレクトリの名前。ページの一生で変わらないので一度だけ引く。

import { useQuery } from "@tanstack/react-query"

import { rpc } from "../../../../domain/rpc.ts"

/** 届く前・取れなかったとき・空のときは空文字（札は部屋の名前だけの形になる）。 */
export function useProjectName(): string {
  const { data } = useQuery(
    rpc.repository.projectName.queryOptions({ retry: false, staleTime: Infinity }),
  )
  return data ?? ""
}
