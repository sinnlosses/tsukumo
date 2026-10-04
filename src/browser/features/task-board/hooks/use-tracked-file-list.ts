// 作業ツリーの git 管理下のファイルの一覧を、タスクのモーダルを開いているあいだ取るフック。
// 「エディタで開く」を押せるのは、タスクファイルが作業ツリーで git 管理下にあるときだけ（`main` にだけあるタスクファイルはサーバの `openTrackedFile` が断る）。
//
// 一覧は手続き `repository.listFiles`（`git ls-files`）で、開くたびに取り直す（`staleTime: 0`）。
// 同じ手続きのキャッシュはほかの部品も長めの間隔で読んでいて、それを待つと、タスクを登録した直後に開いたモーダルでいま管理下にあるファイルが押せないまま残る。

import { useQuery } from "@tanstack/react-query"

import { rpc } from "../../../domain/rpc.ts"
import type { TrackedFileList } from "../domain/tracked-file-list.ts"

export function useTrackedFileList(enabled: boolean): TrackedFileList {
  const { data, isFetching } = useQuery(
    rpc.repository.listFiles.queryOptions({ enabled, retry: false, staleTime: 0 }),
  )

  if (isFetching) {
    return { kind: "checking" }
  }
  return { kind: "known", files: new Set(data ?? []) }
}
