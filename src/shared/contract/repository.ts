// 作業ディレクトリの git リポジトリを読む手続きの契約。
// 運ぶのはリポジトリ相対のパスとプロジェクトの設定の値だけで、ほかのファイルの中身は運ばない。

import { oc } from "@orpc/contract"
import { z } from "zod"

import { projectSettingsDraftSchema } from "../repository/project-settings.ts"

export const repositoryContract = {
  /** git 管理下のファイルのパス。git 管理下でない・`git` が無いときは空（候補が出ないだけ）。 */
  listFiles: oc.output(z.array(z.string()).readonly()),
  /** 作業ディレクトリの名前（末尾のディレクトリ名）。 */
  projectName: oc.output(z.string()),
  /** プロジェクトの設定を書く画面の下書き（いまのファイルの状態と、欄ごとの初期値）。 */
  projectSettingsDraft: oc.output(projectSettingsDraftSchema),
}
