// 割り込みの知らせ（`Alert`）を出す store。姿が進んで割り込みに当てる出来事が起きたら、ブラウザの通知と鈴の音を出す。
// 画面を見ているあいだは出さず、見える状態に戻ったら出した通知を閉じる。読み込み・繋ぎ直しで姿が入れ替わったときは出さない。

import { create } from "zustand"

import { loadAlertSetting } from "../../../../stores/alert-setting.ts"
import { useSession } from "../../../../stores/session.ts"
import { primeBell, ringBell } from "../../../../utils/bell.ts"
import { alertEventsBetween, type AlertEvent } from "../domain/alert-event.ts"

type AlertState = {
  /** 出した出来事の鍵。同じ鍵は2度出さない（`tag` の効かないブラウザでも畳める）。 */
  readonly sentKeys: ReadonlySet<string>
  /** 出して、まだ閉じていない通知。 */
  readonly shown: readonly Notification[]
}

export const useAlert = create<AlertState>()((set, get) => {
  useSession.subscribe((next, previous) => {
    if (next.state === previous.state || next.generation !== previous.generation) {
      return
    }
    const fresh = alertEventsBetween(previous.state, next.state).filter(
      (event) => !get().sentKeys.has(event.key),
    )
    if (fresh.length === 0) {
      return
    }
    set({ sentKeys: new Set([...get().sentKeys, ...fresh.map((event) => event.key)]) })
    if (isWatching()) {
      return
    }
    const setting = loadAlertSetting()
    const chosen = fresh.filter((event) => setting.events[event.kind])
    if (chosen.length === 0) {
      return
    }
    if (setting.notify) {
      set({ shown: [...get().shown, ...chosen.flatMap(showNotification)] })
    }
    if (setting.bell) {
      ringBell()
    }
  })
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      return
    }
    for (const notification of get().shown) {
      notification.close()
    }
    set({ shown: [] })
  })
  // 読み込み直したあとは、最初の操作の中でしか音を出せる状態にできない。
  for (const type of ["pointerdown", "keydown"] as const) {
    document.addEventListener(type, primeBellOnce, { once: true, capture: true })
  }
  return { sentKeys: new Set(), shown: [] }
})

/** pointerdown と keydown の両方に付けるので、どちらかが先に来たら両方を外す。 */
function primeBellOnce(): void {
  document.removeEventListener("pointerdown", primeBellOnce, { capture: true })
  document.removeEventListener("keydown", primeBellOnce, { capture: true })
  if (loadAlertSetting().bell) {
    primeBell()
  }
}

/** 利用者がこの画面を見ているか。見えていて、かつフォーカスがこの文書にあるときだけ見ているとみなす。 */
function isWatching(): boolean {
  return document.visibilityState === "visible" && document.hasFocus()
}

/** 通知を1件出す。`Notification` が無い・許しが無いときは出さない。押したらこのタブへ戻して閉じる。 */
function showNotification(event: AlertEvent): readonly Notification[] {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return []
  }
  const notification = new Notification(event.title, {
    body: event.body,
    tag: `tsukumo-${event.kind}`,
  })
  notification.addEventListener("click", () => {
    window.focus()
    notification.close()
  })
  return [notification]
}
