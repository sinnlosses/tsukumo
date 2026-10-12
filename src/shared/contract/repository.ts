// 作業ディレクトリの git リポジトリを読む手続きの契約。
// 運ぶのはリポジトリ相対のパスと作業ディレクトリの名前だけで、ファイルの中身は運ばない。

import { oc } from "@orpc/contract"
import { z } from "zod"

export const repositoryContract = {
  /** git 管理下のファイルのパス。git 管理下でない・`git` が無いときは空（候補が出ないだけ）。 */
  listFiles: oc.output(z.array(z.string()).readonly()),
  /** 作業ディレクトリの名前（末尾のディレクトリ名）。 */
  projectName: oc.output(z.string()),
  /** タスク一覧を今すぐ1回読み直し、読み終えてから返る。一覧そのものは `tasks-changed` で届く。 */
  refreshTasks: oc.output(z.void()),
}
