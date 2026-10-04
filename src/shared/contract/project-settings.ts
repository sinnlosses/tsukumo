// プロジェクトの設定を書くコマンドの契約。

import { commandBase } from "../command.ts"
import { taskSettingsSchema } from "../repository/project-settings.ts"

export const projectSettingsContract = {
  /**
   * 起動先の `.tsukumo/project.json` を、画面で保存した値で書く（読めない中身も上書きする。確かめるのは画面）。
   * 起こし直さない。効くのはタスク一覧の次の見回りから。コミットはしない。
   */
  save: commandBase.input(taskSettingsSchema),
}
