import { afterEach, describe, expect, it } from "vitest"

import { loadAlertSetting, saveAlertSetting } from "../../../src/browser/stores/alert-setting.ts"

const DEFAULT_ALERT_SETTING = {
  notify: false,
  bell: false,
  events: { question: true, permission: true, failure: true, finished: false },
}

afterEach(() => {
  localStorage.clear()
})

describe("知らせの設定", () => {
  it("何も保存していなければ、通知と鈴は切、出来事は問い・許可・失敗だけ入", () => {
    expect(loadAlertSetting()).toEqual({
      notify: false,
      bell: false,
      events: { question: true, permission: true, failure: true, finished: false },
    })
  })

  it("保存した値を読み返す", () => {
    const saved = {
      notify: true,
      bell: true,
      events: { question: false, permission: true, failure: false, finished: true },
    }
    saveAlertSetting(saved)
    expect(loadAlertSetting()).toEqual(saved)
  })

  it("壊れた値・欄の欠けた値は既定に畳む", () => {
    localStorage.setItem("tsukumo-alert:v1", "{壊れた")
    expect(loadAlertSetting()).toEqual(DEFAULT_ALERT_SETTING)
    localStorage.setItem("tsukumo-alert:v1", JSON.stringify({ notify: true, bell: true }))
    expect(loadAlertSetting()).toEqual(DEFAULT_ALERT_SETTING)
  })
})
