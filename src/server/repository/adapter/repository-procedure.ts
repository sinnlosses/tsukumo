// 作業ディレクトリの git リポジトリを読む手続き。形は `repositoryContract`。
// 照合（起動トークン・`Origin`）は束ねる側のミドルウェアが済ませているので、ここは委ねるだけ。

import { implement } from "@orpc/server"

import { repositoryContract } from "../../../shared/contract/repository.ts"
import type {
  CodeBlockStart,
  CodeBlockStartRequest,
} from "../../../shared/repository/code-block-start.ts"
import type { FileExcerpt, FileExcerptRequest } from "../../../shared/repository/file-excerpt.ts"
import type { RepositoryFileList } from "../../../shared/repository/repository-file-list.ts"

/** この機能の手続きが使う関数（中身は配線が渡す）。読みの失敗は投げずに、読めなかったときの値で返す。 */
export type RepositoryProcedurePorts = {
  /** git 管理下のファイルのパス（作業ディレクトリからの相対）と、上限で落とした件数。git 管理下でない・`git` が無いときはパスが空。 */
  readonly listRepositoryFiles: () => Promise<RepositoryFileList>
  /** git 管理下のファイルの、指した行の前後の抜き書き。管理下でない・読めないときは `unavailable`。 */
  readonly readFileExcerpt: (request: FileExcerptRequest) => Promise<FileExcerpt>
  /** `Code` の塊の頭の行が管理下のファイルの何行目か。決められないときは `unknown`。 */
  readonly readCodeBlockStart: (request: CodeBlockStartRequest) => Promise<CodeBlockStart>
  /** 作業ディレクトリの名前。 */
  readonly projectName: () => string
  /** タスク一覧を今すぐ1回読み直し、読み終えてから解決する。 */
  readonly refreshTasks: () => Promise<void>
}

export function repositoryProcedure(ports: RepositoryProcedurePorts) {
  const procedure = implement(repositoryContract)
  return procedure.router({
    listFiles: procedure.listFiles.handler(() => ports.listRepositoryFiles()),
    fileExcerpt: procedure.fileExcerpt.handler(({ input }) => ports.readFileExcerpt(input)),
    codeBlockStart: procedure.codeBlockStart.handler(({ input }) =>
      ports.readCodeBlockStart(input),
    ),
    projectName: procedure.projectName.handler(() => ports.projectName()),
    refreshTasks: procedure.refreshTasks.handler(() => ports.refreshTasks()),
  })
}
