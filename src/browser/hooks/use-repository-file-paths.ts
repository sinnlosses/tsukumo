// git 管理下のファイルのパスを取るフック。**どの機能の語彙も持たない**ので `browser/hooks/`
// （docs/design.md 2章の箱の表）。もとは `dispatch/hooks/`（`@` 補完だけの読み手）にあったが、
// `main-view/markdown/`（レポートに書かれたパスを押せる部品にする）も読むようになったので、
// 読み手が2つになった時点でここへ上げた。
//
// **一覧は1回取ってブラウザ側で絞る／照合する**（打鍵や描画のたびにサーバへ問い合わせない。
// `git ls-files` を起こすたびに子プロセスが立つ）。取得は TanStack Query に任せるので、
// 呼び出し側に取得の配線は無い。
//
// サーバ側は `GET /repository-file`（`src/server/repository/adapter/repository-file.ts` の `git ls-files`）で、
// **中身は読まない**。

import { useQuery } from "@tanstack/react-query"

import { readRepositoryFileList, REPOSITORY_FILE_PATH } from "../../shared/repository-file.ts"
import { sessionTokenUrl } from "../lib/session-token-url.ts"

/**
 * 一覧を取り直す間隔。**0 でも `Infinity` でもない**のは、セッションの間にファイルが増える
 * （キャラクターが作る）一方で、打鍵や描画のたびに `git ls-files` を起こしたくないため。
 * 最初に呼ばれた1回で取り、この時間が過ぎてから次に呼ばれると取り直す。
 */
const FILE_LIST_STALE_TIME_MS = 30_000

/** 一覧をキャッシュに残す時間。使い終わってしばらくは取り直さずに済む。 */
const FILE_LIST_GC_TIME_MS = 5 * 60_000

/**
 * git 管理下のファイルのパスを取る。**`enabled` が false の間は取りに行かない**（`@` を
 * 一度も打たない・レポートが1つも出ていない利用者のために、起動しただけでは一覧を作らせない）。
 *
 * **読めなかったときは空**（git リポジトリでないときもサーバが空を返す）。候補が出ない・
 * パスが押せないだけで、他は動く。
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
