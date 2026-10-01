// git 管理下のファイルのパスを取るフック。
//
// 一覧は1回取ってブラウザ側で絞る／照合する（打鍵や描画のたびにサーバへ問い合わせない。`git ls-files` を起こすたびに子プロセスが立つ）。
// サーバ側は手続き `repository.listFiles`（`git ls-files`）で、中身は読まない。

import { useQuery } from "@tanstack/react-query"

import { rpc } from "../../../../../domain/rpc.ts"
import { type FileSuggestionIndex, indexFilePaths } from "../../domain/file-suggestion-index.ts"

/**
 * 一覧を取り直す間隔。
 * 0 でも `Infinity` でもないのは、セッションの間にファイルが増える（キャラクターが作る）一方で、打鍵や描画のたびに `git ls-files` を起こしたくないため。
 */
const FILE_LIST_STALE_TIME_MS = 30_000

/** 一覧をキャッシュに残す時間。使い終わってしばらくは取り直さずに済む。 */
const FILE_LIST_GC_TIME_MS = 5 * 60_000

/**
 * git 管理下のファイルのパスを取る。
 * `enabled` が false の間は取りに行かない（起動しただけでは一覧を作らせない）。
 * 読めなかったときは空（git リポジトリでないときもサーバが空を返す）。
 */
export function useRepositoryFilePaths(enabled: boolean): readonly string[] {
  const { data } = useQuery(
    rpc.repository.listFiles.queryOptions({
      enabled,
      // 落ちた応答は再試行せず、すぐ空に倒す。
      retry: false,
      staleTime: FILE_LIST_STALE_TIME_MS,
      gcTime: FILE_LIST_GC_TIME_MS,
    }),
  )

  return data ?? []
}

/**
 * {@link useRepositoryFilePaths} と同じ一覧を、`@` 補完の索引にして返す。
 * 索引は一覧を取ったとき（`select`）に1回だけ作る。
 */
export function useRepositoryFileIndex(enabled: boolean): FileSuggestionIndex {
  const { data } = useQuery(
    rpc.repository.listFiles.queryOptions({
      enabled,
      retry: false,
      staleTime: FILE_LIST_STALE_TIME_MS,
      gcTime: FILE_LIST_GC_TIME_MS,
      select: indexFilePaths,
    }),
  )

  return data ?? []
}
