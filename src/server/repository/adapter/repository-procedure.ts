// 作業ディレクトリの git リポジトリを読む手続き。形は `repositoryContract`。
// 照合（起動トークン・`Origin`）は束ねる側のミドルウェアが済ませているので、ここは委ねるだけ。

import { implement } from "@orpc/server"

import { repositoryContract } from "../../../shared/contract/repository.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type RepositoryProcedurePorts = {
  /** git 管理下のファイルのパス（作業ディレクトリからの相対）。git 管理下でない・`git` が無いときは空を返す。 */
  readonly listRepositoryFiles: () => Promise<readonly string[]>
}

export function repositoryProcedure(ports: RepositoryProcedurePorts) {
  const procedure = implement(repositoryContract)
  return procedure.router({
    // 一覧を作れなかった回は空の並びを配る（候補が出ない・パスが押せないだけで、画面は続く）。
    listFiles: procedure.listFiles.handler(() => ports.listRepositoryFiles().catch(() => [])),
  })
}
