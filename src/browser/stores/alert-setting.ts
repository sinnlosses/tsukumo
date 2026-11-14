// 割り込みの知らせ（`Alert`）の設定。ブラウザの通知・鈴の音を出すかと、どの出来事で出すか。端末ごとの好み。
// 通知の既定は切。入れる操作の中でしか許しを求めないので、既定を入にすると許しを求める機会が無くなる。

import { z } from "zod"

import { localPreference } from "../utils/local-preference.ts"

/** 割り込みの知らせを出す出来事。問い（質問）・許可・失敗・終わった。 */
export type AlertEventKind = "question" | "permission" | "failure" | "finished"

export type AlertSetting = {
  readonly notify: boolean
  readonly bell: boolean
  readonly events: Readonly<Record<AlertEventKind, boolean>>
}

const DEFAULT_ALERT_SETTING = {
  notify: false,
  bell: false,
  events: { question: true, permission: true, failure: true, finished: false },
} as const satisfies AlertSetting

const alertSettingSchema = z.object({
  notify: z.boolean(),
  bell: z.boolean(),
  events: z.object({
    question: z.boolean(),
    permission: z.boolean(),
    failure: z.boolean(),
    finished: z.boolean(),
  }),
})

const alertPreference = localPreference<AlertSetting>(
  "tsukumo-alert:v1",
  alertSettingSchema,
  DEFAULT_ALERT_SETTING,
)

export function loadAlertSetting(): AlertSetting {
  return alertPreference.load()
}

export function saveAlertSetting(setting: AlertSetting): void {
  alertPreference.save(setting)
}
