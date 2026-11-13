// 帯の設定の「知らせ」（通知・鈴の音・出す出来事）。利用者の端末の設定（`localStorage`）。
// 通知の許しと `AudioContext` は利用者の操作の中でしか得られないので、どちらも入れた `onChange` の中で求める。

import { useState } from "react"

import {
  loadAlertSetting,
  saveAlertSetting,
  type AlertSetting,
} from "../../../../stores/alert-setting.ts"
import { primeBell, ringBell } from "../../../../utils/bell.ts"

/** `refused` はブラウザが通知を断った（許しが得られない・`Notification` が無い）ので、通知を切に戻したこと。 */
export type ScreenNavSettingsAlertNotice = { readonly kind: "none" } | { readonly kind: "refused" }

export type ScreenNavSettingsAlert = {
  readonly value: AlertSetting
  readonly notice: ScreenNavSettingsAlertNotice
  readonly onChange: (next: AlertSetting) => void
}

export function useAlertSetting(): ScreenNavSettingsAlert {
  const [value, setValue] = useState<AlertSetting>(loadAlertSetting)
  const [notice, setNotice] = useState<ScreenNavSettingsAlertNotice>({ kind: "none" })

  function store(next: AlertSetting): void {
    setValue(next)
    saveAlertSetting(next)
  }

  function refuse(): void {
    // 許しを待つあいだにほかの行が変わっていても消さないよう、保存した最新の値から通知だけを切る。
    store({ ...loadAlertSetting(), notify: false })
    setNotice({ kind: "refused" })
  }

  function onChange(next: AlertSetting): void {
    const notifyTurnedOn = next.notify && !value.notify
    if (next.bell && !value.bell) {
      primeBell()
      ringBell()
    }
    store(next)
    if (!notifyTurnedOn) {
      return
    }
    setNotice({ kind: "none" })
    if (typeof Notification === "undefined" || Notification.permission === "denied") {
      refuse()
      return
    }
    if (Notification.permission === "granted") {
      return
    }
    void Notification.requestPermission()
      .then((permission) => {
        if (permission !== "granted") {
          refuse()
        }
      })
      .catch(() => {
        // 求められなかった（古い呼び方しか無いなど）のは断られたのと同じに扱う。
        refuse()
      })
  }

  return { value, notice, onChange }
}
