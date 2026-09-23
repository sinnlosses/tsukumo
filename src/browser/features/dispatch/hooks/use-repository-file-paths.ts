// `@` 補完が並べる候補の**元**（git 管理下のファイルのパス）を取るフック。取得だけを持ち、
// 絞り方と一覧の見た目は `file-suggestions.tsx` にある（docs/design.md 2章「機能の中を分ける」。
// 外の世界に触るフックだけを機能の直下から出した）。
//
// **一覧は1回取ってブラウザ側で絞る**（打鍵のたびにサーバへ問い合わせない。`git ls-files` を
// 打鍵ごとに起こすと子プロセスがその回数だけ立つ）。取得は TanStack Query に任せるので、
// 呼び出し側（`hooks/use-composer.ts`）に取得の配線は無い。
//
// サーバ側は `GET /repository-file`（`src/server/adapter/repository-file.ts` の `git ls-files`）で、
// **中身は読まない**。

import { useQuery } from "@tanstack/react-query"

import { readRepositoryFileList, REPOSITORY_FILE_PATH } from "../../../../shared/repository-file.ts"
import { sessionTokenUrl } from "../../../lib/session-token-url.ts"

/**
 * 一覧を取り直す間隔。**0 でも `Infinity` でもない**のは、セッションの間にファイルが増える
 * （キャラクターが作る）一方で、打鍵のたびに `git ls-files` を起こしたくないため。`@` を打った
 * 最初の1回で取り、この時間が過ぎてから次に `@` を打つと取り直す。
 */
const FILE_LIST_STALE_TIME_MS = 30_000

/** 一覧をキャッシュに残す時間。`@` を使い終わってしばらくは取り直さずに済む。 */
const FILE_LIST_GC_TIME_MS = 5 * 60_000

/**
 * git 管理下のファイルのパスを取る。**`enabled` が false の間は取りに行かない**（`@` を
 * 一度も打たない利用者のために、起動しただけでは一覧を作らせない）。
 *
 * **読めなかったときは空**（git リポジトリでないときもサーバが空を返す）。候補が出ないだけで、
 * 入力欄はそのまま使える。
 */
export function useRepositoryFilePaths(enabled: boolean): readonly string[] {
  const { data } = useQuery({
    queryKey: [REPOSITORY_FILE_PATH] as const,
    queryFn: async () => {
      const response = await fetch(repositoryFileUrl())
      return response.ok ? readRepositoryFileList(await response.json()) : []
    },
    enabled,
    staleTime: FILE_LIST_STALE_TIME_MS,
    gcTime: FILE_LIST_GC_TIME_MS,
  })

  return data ?? []
}

/**
 * 一覧の URL。**起動トークンを付ける**（`/ws` と同じ守り方。`lib/session-token-url.ts` に寄せた）。
 */
function repositoryFileUrl(): string {
  return sessionTokenUrl(REPOSITORY_FILE_PATH)
}
