// 作業ディレクトリの git リポジトリを読む手続きの契約。
// 運ぶのはリポジトリ相対のパスだけで、ファイルの中身は運ばない。

import { oc } from "@orpc/contract"
import { z } from "zod"

export const repositoryContract = {
  /** git 管理下のファイルのパス。git 管理下でない・`git` が無いときは空（候補が出ないだけ）。 */
  listFiles: oc.output(z.array(z.string()).readonly()),
}
