// サイドバーの「セッション情報」。モデル・許可モードの `<select>`（共有部品。
// `src/ui/component/select.tsx`）を並べ、変更で `set-model` / `set-permission-mode` を
// `dispatch` する。**次に届く `session-info` で `<select>` の選択が上書きされる**
// （サーバ側の値が正になる。旧の `src/presentation/browser/session-info.ts` と同じ考え方）。

import { type ReactElement } from "react"

import {
  isModelAlias,
  isPermissionMode,
  type ModelAlias,
  type PermissionMode,
} from "../../protocol/command.ts"
import { useSession } from "../app.tsx"
import { Select } from "../component/select.tsx"

// 許可モードの選択肢と、日本語ラベル。順序は <select> に出す並び。
const PERMISSION_MODE_LABELS: ReadonlyArray<readonly [PermissionMode, string]> = [
  ["default", "毎回聞く"],
  ["acceptEdits", "編集は自動"],
  ["auto", "自動判定"],
  ["plan", "プラン"],
  ["bypassPermissions", "全部許す"],
]
// `permissionMode` がまだ届いていないとき（session-info 前）の見た目上の既定値。
// `src/core/session-driver.ts` の DEFAULT_PERMISSION_MODE と同じ値。
const PERMISSION_MODE_FALLBACK: PermissionMode = "auto"
const DANGEROUS_PERMISSION_MODE: PermissionMode = "bypassPermissions"
const PERMISSION_MODE_SELECT_ID = "tsukumo-permission-mode"

// モデルのエイリアスと、日本語ラベル。値は `src/protocol/command.ts` の MODEL_ALIASES と同じ3つ。
const MODEL_LABELS: ReadonlyArray<readonly [ModelAlias, string]> = [
  ["opus", "Opus"],
  ["sonnet", "Sonnet"],
  ["haiku", "Haiku"],
]
// `model` がまだ届いていない、またはエイリアスと対応しないときの見た目上の既定値。値は
// `src/core/session-driver.ts` の DEFAULT_MODEL と同じ（`opus`）。
const MODEL_FALLBACK: ModelAlias = "opus"
const MODEL_SELECT_ID = "tsukumo-model"

/**
 * `session-info` の `model`（フルネームや実装依存の識別子）から、`<select>` に選択済みで
 * 出すエイリアスを決める。**部分一致**にしてあるのは、フルネームの形（`claude-opus-4-1` の
 * ような値）が実装側の都合で変わりうるため。
 */
function resolveModelAlias(model: string | undefined): ModelAlias {
  if (model === undefined) {
    return MODEL_FALLBACK
  }

  return MODEL_LABELS.find(([alias]) => model.includes(alias))?.[0] ?? MODEL_FALLBACK
}

function resolvePermissionMode(mode: string | undefined): PermissionMode {
  return mode !== undefined && isPermissionMode(mode) ? mode : PERMISSION_MODE_FALLBACK
}

/**
 * `.session-info` は2列の grid（`src/ui/style/sidebar.css`）で、ラベルと値（`<select>`）を
 * 直接の子として並べる。行ごとに別々の flex で並べると、ラベルの文字数の差がそのまま
 * `<select>` の左端のズレになるため、行の境目を div で区切らずグリッド1つに任せる
 * （2026-09-13 T-092）。`bypassPermissions` を選んでいるときは警告色を付ける
 * （`.permission-mode-select-danger`）。
 */
export function SessionInfo(): ReactElement {
  const { state, dispatch } = useSession()
  const model = resolveModelAlias(state.model)
  const permissionMode = resolvePermissionMode(state.permissionMode)
  const dangerClass =
    permissionMode === DANGEROUS_PERMISSION_MODE ? " permission-mode-select-danger" : ""

  return (
    <div className="session-info">
      <label htmlFor={MODEL_SELECT_ID} className="session-info-label">
        モデル
      </label>
      <span className="session-info-value">
        <Select
          id={MODEL_SELECT_ID}
          ariaLabel="モデル"
          className="model-select"
          value={model}
          disabled={false}
          options={MODEL_LABELS.map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            if (isModelAlias(value)) {
              dispatch({ type: "set-model", model: value })
            }
          }}
        />
      </span>
      <label htmlFor={PERMISSION_MODE_SELECT_ID} className="session-info-label">
        許可モード
      </label>
      <span className="session-info-value">
        <Select
          id={PERMISSION_MODE_SELECT_ID}
          ariaLabel="許可モード"
          className={`permission-mode-select${dangerClass}`}
          value={permissionMode}
          disabled={false}
          options={PERMISSION_MODE_LABELS.map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            if (isPermissionMode(value)) {
              dispatch({ type: "set-permission-mode", mode: value })
            }
          }}
        />
      </span>
    </div>
  )
}
