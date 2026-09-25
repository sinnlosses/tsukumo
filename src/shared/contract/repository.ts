// 作業ディレクトリの git リポジトリを読む手続きの契約（`docs/glossary.md`「契約」）。受け手は
// `src/server/repository/adapter/repository-procedure.ts`。
//
// **運ぶのはリポジトリ相対のパスだけで、ファイルの中身は運ばない。** どのファイルが git 管理下かを
// 知るのは外の世界に触る仕事なので `src/server/repository/adapter/repository-file.ts` が持つ。

import { oc } from "@orpc/contract"
import { z } from "zod"

export const repositoryContract = {
  /**
   * git 管理下のファイルのパス（入力欄の `@` 補完と、レポートのパスを押せる部品が読む）。
   * **git 管理下でない・`git` が無いときは空**（候補が出ないだけ）。
   */
  listFiles: oc.output(z.array(z.string()).readonly()),
}
