// ワークフローの設定の手続きの契約。読むのは `/rpc`、書くのは `/ws` のコマンド。
import { oc } from "@orpc/contract"
import { z } from "zod"

import { commandBase } from "../command.ts"
import {
  workflowSettingChangeSchema,
  workflowSettingViewSchema,
} from "../workflow-setting/workflow-setting.ts"

const MAX_SETTING_VALUE_LENGTH = 200

/**
 * `tw config set` の引数に渡すので、`-` で始まる語（引数の解釈でオプションに取られる）と改行は受けない。
 * 欄と値が語彙の中かはワークフローが検査する。
 */
const settingKeySchema = z
  .string()
  .max(MAX_SETTING_VALUE_LENGTH)
  .regex(/^[a-z][a-z0-9_.]*$/)

const settingValueSchema = z
  .string()
  .min(1)
  .max(MAX_SETTING_VALUE_LENGTH)
  .refine((value) => !value.startsWith("-") && !/[\r\n]/.test(value))

export const workflowSettingContract = {
  /** いまの欄と値。`tw` が無い・設定の口が無い・`.tw/config.toml` が無い・読めないときは `unavailable`。 */
  read: oc.output(workflowSettingViewSchema),
}

export const workflowSettingCommandContract = {
  /** 欄1つを書き、読み直した面か、ワークフローが断った理由を返す（応答を待って受け取る）。 */
  set: commandBase
    .input(z.object({ key: settingKeySchema, value: settingValueSchema }))
    .output(workflowSettingChangeSchema),
}
