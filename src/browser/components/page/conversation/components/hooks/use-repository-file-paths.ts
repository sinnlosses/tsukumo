// git 管理下のファイルのパスを取るフック。読むのは入力欄（`dispatch/` の `@` 補完）と
// メインビュー（`main-view/markdown/`。レポートに書かれたパスを押せる部品にする）の2つの部品なので、
// 会話の画面の `components/hooks/` に置く（docs/design.md 2章「ページの形」）。
//
// 一覧は1回取ってブラウザ側で絞る／照合する（打鍵や描画のたびにサーバへ問い合わせない。
// `git ls-files` を起こすたびに子プロセスが立つ）。取得は TanStack Query に任せるので、
// 呼び出し側に取得の配線は無い。
//
// サーバ側は手続き `repository.listFiles`（`src/server/repository/adapter/repository-file.ts` の
// `git ls-files`）で、中身は読まない。

import { useQuery } from "@tanstack/react-query"

import { rpc } from "../../../../../lib/rpc-client.ts"

/**
 * 一覧を取り直す間隔。0 でも `Infinity` でもないのは、セッションの間にファイルが増える
 * （キャラクターが作る）一方で、打鍵や描画のたびに `git ls-files` を起こしたくないため。
 * 最初に呼ばれた1回で取り、この時間が過ぎてから次に呼ばれると取り直す。
 */
const FILE_LIST_STALE_TIME_MS = 30_000

/** 一覧をキャッシュに残す時間。使い終わってしばらくは取り直さずに済む。 */
const FILE_LIST_GC_TIME_MS = 5 * 60_000

/**
 * git 管理下のファイルのパスを取る。`enabled` が false の間は取りに行かない（`@` を
 * 一度も打たない・レポートが1つも出ていない利用者のために、起動しただけでは一覧を作らせない）。
 *
 * 読めなかったときは空（git リポジトリでないときもサーバが空を返す）。候補が出ない・
 * パスが押せないだけで、他は動く。
 */
export function useRepositoryFilePaths(enabled: boolean): readonly string[] {
  const { data } = useQuery(
    rpc.repository.listFiles.queryOptions({
      enabled,
      // 落ちた応答は再試行せず、すぐ空に倒す（手続きにする前と同じ）。
      retry: false,
      staleTime: FILE_LIST_STALE_TIME_MS,
      gcTime: FILE_LIST_GC_TIME_MS,
    }),
  )

  // 取れなかった回（403・落ちた応答）も、まだ届いていない間と同じく空（候補が出ないだけ）。
  return data ?? []
}
