// 作業ディレクトリの git リポジトリを読む手続きの契約。
// 運ぶのはリポジトリ相対のパスと作業ディレクトリの名前と、git 管理下のファイルの行の範囲の抜き書き（`FileExcerpt`）だけで、ファイルを丸ごとは運ばない。

import { oc } from "@orpc/contract"
import { z } from "zod"

import { fileExcerptRequestSchema, fileExcerptSchema } from "../repository/file-excerpt.ts"

export const repositoryContract = {
  /**
   * git 管理下のファイルのパスと、件数の上限で落とした件数（`RepositoryFileList`）。
   * git 管理下でない・`git` が無いときはパスが空（候補が出ないだけ）。
   */
  listFiles: oc.output(
    z.object({
      paths: z.array(z.string()).readonly(),
      omittedCount: z.number(),
    }),
  ),
  /**
   * 指した行の前後の抜き書き。
   * 読むのは git 管理下の一覧にあるパスだけで、読めないときは `unavailable`（失敗のエラーにはしない）。
   */
  fileExcerpt: oc.input(fileExcerptRequestSchema).output(fileExcerptSchema),
  /** 作業ディレクトリの名前（末尾のディレクトリ名）。 */
  projectName: oc.output(z.string()),
  /** タスク一覧を今すぐ1回読み直し、読み終えてから返る。一覧そのものは `tasks-changed` で届く。 */
  refreshTasks: oc.output(z.void()),
}
