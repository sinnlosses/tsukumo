// 動き方の操作子のうち、モデル・effort・許可モードの3つが受け取れる形を返すフック。
//
// 表示はサーバから届いた値だけに従い、押した側へ先に倒さない。
// ターン進行中も変えられる（起こし直さない）ので、押せない状態は持たない（effort の選べない理由は `EffortSelect` が持つ）。

import {
  isEffortLevel,
  isModelAlias,
  isPermissionMode,
  type ModelAlias,
  type PermissionMode,
} from "../../shared/command.ts"
import type { ModelEffortSupport } from "../../shared/session/session-event.ts"
import { resolveEffortSelect, type EffortSelect } from "../domain/effort-label.ts"
import { resolveModelAlias } from "../domain/model-label.ts"
import {
  isDangerousPermissionMode,
  resolvePermissionMode,
} from "../domain/permission-mode-label.ts"
import { useSession } from "./session.ts"

export type ModelPermissionControl = {
  readonly model: ModelAlias
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

  return {
    model: shownModel,
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
