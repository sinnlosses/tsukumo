// 続きから復元した依頼の控え。記録は控えを持たないので、棚の原寸を取りに行ってブラウザで縮め直す。

import { useQuery } from "@tanstack/react-query"

import { shrinkToThumbnail } from "../../../domain/prompt-image-thumbnail.ts"

/** 作り直した控え。棚から原寸が消えていた・読めなかったときは `unavailable`。 */
export type RemadeThumbnail =
  | { readonly kind: "pending" }
  | { readonly kind: "made"; readonly src: string }
  | { readonly kind: "unavailable" }

const PENDING: RemadeThumbnail = { kind: "pending" }

/**
 * `fullUrl` は棚の原寸を配る経路の URL（起動トークンつき）。
 * 同じ原寸から作る控えは変わらないので、ページの一生で1回だけ作り、取り直さない。
 */
export function useRemadeThumbnail(fullUrl: string): RemadeThumbnail {
  const { data } = useQuery({
    queryKey: ["remade-prompt-image-thumbnail", fullUrl],
    queryFn: async (): Promise<RemadeThumbnail> => {
      const src = await shrinkToThumbnail(fullUrl)
      return src === undefined ? { kind: "unavailable" } : { kind: "made", src }
    },
    staleTime: Infinity,
    retry: false,
  })
  return data ?? PENDING
}
