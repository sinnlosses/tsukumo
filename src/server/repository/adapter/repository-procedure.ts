// 作業ディレクトリの git リポジトリを読む手続き。形は `repositoryContract`。
// 照合（起動トークン・`Origin`）は束ねる側のミドルウェアが済ませているので、ここは委ねるだけ。

import { implement } from "@orpc/server"

import { repositoryContract } from "../../../shared/contract/repository.ts"
import {
  EMPTY_REPOSITORY_FILE_LIST,
  type RepositoryFileList,
} from "../../../shared/repository/repository-file-list.ts"

/** この機能の手続きが使う口（中身は配線が渡す）。 */
export type RepositoryProcedurePorts = {
  /** git 管理下のファイルのパス（作業ディレクトリからの相対）と、上限で落とした件数。git 管理下でない・`git` が無いときはパスが空。 */
  readonly listRepositoryFiles: () => Promise<RepositoryFileList>
  /** 作業ディレクトリの名前。 */
  readonly projectName: () => string
  /** タスク一覧を今すぐ1回読み直し、読み終えてから解決する。 */
  readonly refreshTasks: () => Promise<void>
}

export function repositoryProcedure(ports: RepositoryProcedurePorts) {
  const procedure = implement(repositoryContract)
  return procedure.router({
    // 一覧を作れなかった回は空の並びを配る（候補が出ない・パスが押せないだけで、画面は続く）。
    listFiles: procedure.listFiles.handler(() =>
      ports.listRepositoryFiles().catch(() => EMPTY_REPOSITORY_FILE_LIST),
    ),
    projectName: procedure.projectName.handler(() => ports.projectName()),
    // 読めない回は一覧の「不明」が伝えるので、手続きは落とさない。
    refreshTasks: procedure.refreshTasks.handler(() => ports.refreshTasks().catch(() => {})),
  })
}
