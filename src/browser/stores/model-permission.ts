// 動き方の操作子のうち、モデル・effort・許可モードの3つが受け取れる形を返すフック。
//
// 表示はサーバから届いた値だけに従い、押した側へ先に倒さない。
// ターン進行中も変えられる（起こし直さない）ので、押せない状態は持たない（effort の選べない理由は `EffortSelect` が持つ）。

import { useEffect, useState } from "react"

import {
  isEffortLevel,
  isModelAlias,
  isPermissionMode,
  type ModelAlias,
  type PermissionMode,
} from "../../shared/command.ts"
import type { ModelEffortSupport } from "../../shared/session/session-event.ts"
import type { SettingMark } from "../../shared/session/session-state.ts"
import { resolveEffortSelect, type EffortSelect } from "../domain/effort-label.ts"
import { resolveModelAlias } from "../domain/model-label.ts"
import {
  isDangerousPermissionMode,
  resolvePermissionMode,
} from "../domain/permission-mode-label.ts"
import { nowEpochMilliseconds } from "../utils/clock.ts"
import { useSession } from "./session.ts"

/** 口の右肩の点。`accepted` は空洞（受け付けた）、`confirmed` は塗り（効いたのを見届けた）、`none` は点なし。 */
export type SettingDot = "none" | "accepted" | "confirmed"

const CONFIRMED_DOT_MS = 3000

export type ModelPermissionControl = {
  readonly model: ModelAlias
  readonly modelDot: SettingDot
  readonly effortDot: SettingDot
  readonly permissionModeDot: SettingDot
  readonly onSetModel: (value: string) => void
  /** 押した値へ先に倒さない。選べる段・いまの値はサーバから届いた値（`model-effort-support` / `effort-changed`）だけに従う。 */
  readonly effort: EffortSelect
  /** モデルごとの effort 対応表。いまのモデル以外の行（吊り札の一覧）が「effort なし」を書けるかの判定に使う。 */
  readonly modelEffortSupport: readonly ModelEffortSupport[]
  readonly onSetEffort: (value: string) => void
  readonly permissionMode: PermissionMode
  /** 「全部許す」のときだけ字に意味の色を載せる。 */
  readonly permissionModeDangerous: boolean
  readonly onSetPermissionMode: (value: string) => void
}

export function useModelPermission(): ModelPermissionControl {
  const dispatch = useSession((session) => session.dispatch)
  const model = useSession((session) => session.state.model)
  const modelEffortSupport = useSession((session) => session.state.modelEffortSupport)
  const effort = useSession((session) => session.state.effort)
  const permissionMode = useSession((session) =>
    session.state.session.kind === "running" ? session.state.session.permissionMode : undefined,
  )
  // `init`（`session-info`）が届くまでの畳み先は、このセッションを起こした既定。
  // 同梱の既定に倒すと、歯車で Sonnet にして起こし直した直後の帯だけが Opus を名乗る。
  const sessionDefault = useSession((session) => session.state.sessionDefault)

  const shownPermissionMode =
    permissionMode === undefined
      ? sessionDefault.permissionMode
      : resolvePermissionMode(permissionMode)
  // effort の選べる段は「いま出しているモデル」で決まるので、model の畳み込みと同じ値を使う。
  const shownModel = model === undefined ? sessionDefault.model : resolveModelAlias(model)

  const settingMarks = useSession((session) => session.state.settingMarks)
  const modelDot = useSettingDot(settingMarks.model)
  const effortDot = useSettingDot(settingMarks.effort)
  const permissionModeDot = useSettingDot(settingMarks.permissionMode)

  return {
    model: shownModel,
    modelDot,
    effortDot,
    permissionModeDot,
    onSetModel: (value) => {
      if (isModelAlias(value)) {
        dispatch.session.setModel({ model: value })
      }
    },
    effort: resolveEffortSelect(shownModel, modelEffortSupport, effort),
    modelEffortSupport,
    onSetEffort: (value) => {
      if (isEffortLevel(value)) {
        dispatch.session.setEffort({ effort: value })
      }
    },
    permissionMode: shownPermissionMode,
    permissionModeDangerous: isDangerousPermissionMode(shownPermissionMode),
    onSetPermissionMode: (value) => {
      if (isPermissionMode(value)) {
        dispatch.session.setPermissionMode({ mode: value })
      }
    },
  }
}

/**
 * 印を点にし、見届けた点だけ印ごとのタイマーで消す（空洞の点は見届けるか戻すまで残る）。
 * 同じ値の付け直しは `at` が違うので別の印として数え直す。
 */
function useSettingDot(mark: SettingMark): SettingDot {
  // 画面を開いた時点でもう寿命を過ぎている印（配り直された古い切り替え）は、最初から消えたことにする。
  const [expired, setExpired] = useState<string | undefined>(() =>
    remainingDotMs(mark, nowEpochMilliseconds()) <= 0 ? dotKey(mark) : undefined,
  )
  const key = dotKey(mark)

  useEffect(() => {
    if (mark.kind !== "confirmed") {
      return
    }
    const timer = setTimeout(
      () => {
        setExpired(key)
      },
      Math.max(remainingDotMs(mark, nowEpochMilliseconds()), 0),
    )
    return () => {
      clearTimeout(timer)
    }
  }, [key, mark])

  return key === expired ? "none" : mark.kind
}

function dotKey(mark: SettingMark): string {
  return mark.kind === "none" ? "none" : `${mark.kind}:${String(mark.at)}`
}

/** 見届けた印を付けた時刻（サーバが打った `at`）から `now` までに使った分を引いた、点の残り寿命。空洞の点は寿命を持たない。 */
function remainingDotMs(mark: SettingMark, now: number): number {
  switch (mark.kind) {
    case "none":
      return 0
    case "accepted":
      return Number.POSITIVE_INFINITY
    case "confirmed":
      return CONFIRMED_DOT_MS - (now - mark.at)
  }
}
