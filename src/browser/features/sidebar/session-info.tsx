// サイドバーの「セッション情報」。キャラクター・モデル・許可モードの `<select>`（共有部品。
// `src/browser/components/select.tsx`）を並べ、変更で `switch-character` / `set-model` /
// `set-permission-mode` を `dispatch` する。**次に届く `session-info` で `<select>` の選択が
// 上書きされる**（サーバ側の値が正になる）。キャラクターの `<select>` は**選択肢が1つでも出す**
// （docs/design.md 7章）。

import { type ReactElement } from "react"

import {
  isModelAlias,
  isPermissionMode,
  type ModelAlias,
  type PermissionMode,
} from "../../../shared/command.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { type SessionState } from "../../../shared/session-state.ts"
import { Select } from "../../components/select.tsx"
import { screenHash } from "../../stores/screen.tsx"
import { useSession } from "../../stores/session.tsx"
import styles from "./sidebar.module.css"

// 許可モードの選択肢と、日本語ラベル。順序は <select> に出す並び。
const PERMISSION_MODE_LABELS: ReadonlyArray<readonly [PermissionMode, string]> = [
  ["default", "毎回聞く"],
  ["acceptEdits", "編集は自動"],
  ["auto", "自動判定"],
  ["plan", "プラン"],
  ["bypassPermissions", "全部許す"],
]
// `permissionMode` がまだ届いていないとき（session-info 前）の見た目上の既定値。
// `src/server/core/session-driver.ts` の DEFAULT_PERMISSION_MODE と同じ値。
const PERMISSION_MODE_FALLBACK: PermissionMode = "auto"
const DANGEROUS_PERMISSION_MODE: PermissionMode = "bypassPermissions"
const PERMISSION_MODE_SELECT_ID = "tsukumo-permission-mode"

// モデルのエイリアスと、日本語ラベル。値は `src/shared/command.ts` の MODEL_ALIASES と同じ4つ。
// 並びは重い順（Fable は Opus の上の階層なので先頭。2026-09-17）。
const MODEL_LABELS: ReadonlyArray<readonly [ModelAlias, string]> = [
  ["fable", "Fable"],
  ["opus", "Opus"],
  ["sonnet", "Sonnet"],
  ["haiku", "Haiku"],
]
// `model` がまだ届いていない、またはエイリアスと対応しないときの見た目上の既定値。値は
// `src/server/core/session-driver.ts` の DEFAULT_MODEL と同じ（`opus`）。
const MODEL_FALLBACK: ModelAlias = "opus"
const MODEL_SELECT_ID = "tsukumo-model"

const CHARACTER_SELECT_ID = "tsukumo-character"

// キャラクター画面へ入る口の字（docs/design.md 13.6）。立ち絵・差し色・画面の色を整えるのは
// 別の画面で、ここはその入口を1つ置くだけ。
const TUNE_LINK_LABEL = "整える"

// 切り替えは起こし直し（会話が消える）なので、ターン進行中だけ塞ぐ。モデル・許可モードは
// 駆動へのコマンドで会話は消えないので、進行中でも塞がない。理由の文面は**サーバが断るときと
// 同じ1つ**（`shared` の定型文）を使う。
const CHARACTER_SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.switchDuringTurn

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
 * `<select>` に選択済みで出すキャラクターパックの名前。**素材が1体ぶんしか無くても
 * `<select>` は出す**（無いように見えるほうが分かりにくい。docs/design.md 7章）ので、
 * いま出しているパックが分からないときは一覧の先頭に倒す。
 */
function resolveCharacterPack(state: SessionState): string {
  const packs = state.characterPacks
  const current = state.character?.pack
  return packs.some((pack) => pack.name === current) ? (current ?? "") : (packs[0]?.name ?? "")
}

/**
 * `.session-info` は2列の grid（`sidebar.module.css`）で、ラベルと値（`<select>`）を
 * 直接の子として並べる。行ごとに別々の flex で並べると、ラベルの文字数の差がそのまま
 * `<select>` の左端のズレになるため、行の境目を div で区切らずグリッド1つに任せる
 * （2026-09-13）。`bypassPermissions` を選んでいるときは警告色を付ける
 * （`.permission-mode-select-danger`）。
 */
export function SessionInfo(): ReactElement {
  const { state, dispatch } = useSession()
  const currentPack = resolveCharacterPack(state)
  const model = resolveModelAlias(state.model)
  const permissionMode = resolvePermissionMode(state.permissionMode)
  const dangerClass =
    permissionMode === DANGEROUS_PERMISSION_MODE
      ? ` ${styles["permission-mode-select-danger"]}`
      : ""

  return (
    <div className={styles["session-info"]}>
      {state.characterPacks.length > 0 ? (
        <>
          <label htmlFor={CHARACTER_SELECT_ID} className={styles["session-info-label"]}>
            キャラクター
          </label>
          <span className={styles["session-info-value"]}>
            <Select
              id={CHARACTER_SELECT_ID}
              ariaLabel="キャラクター"
              className={styles["character-select"] ?? ""}
              value={currentPack}
              disabled={state.turnInProgress}
              title={state.turnInProgress ? CHARACTER_SWITCH_BLOCKED_TITLE : undefined}
              options={state.characterPacks.map(({ name, label }) => ({ value: name, label }))}
              onChange={(value) => {
                dispatch({ type: "switch-character", name: value })
              }}
            />
            {/* キャラクター画面への入る口。**キャラクターのことはキャラクターの行に集まる**
                （docs/design.md 13.6。ページ最上部のナビは置かない）。字だけのリンクで、
                常設の要素は増えない。 */}
            <a className={styles["session-info-tune"]} href={screenHash("character")}>
              {TUNE_LINK_LABEL}
            </a>
          </span>
        </>
      ) : null}
      <label htmlFor={MODEL_SELECT_ID} className={styles["session-info-label"]}>
        モデル
      </label>
      <span className={styles["session-info-value"]}>
        <Select
          id={MODEL_SELECT_ID}
          ariaLabel="モデル"
          className={styles["model-select"] ?? ""}
          value={model}
          disabled={false}
          title={undefined}
          options={MODEL_LABELS.map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            if (isModelAlias(value)) {
              dispatch({ type: "set-model", model: value })
            }
          }}
        />
      </span>
      <label htmlFor={PERMISSION_MODE_SELECT_ID} className={styles["session-info-label"]}>
        許可モード
      </label>
      <span className={styles["session-info-value"]}>
        <Select
          id={PERMISSION_MODE_SELECT_ID}
          ariaLabel="許可モード"
          className={`${styles["permission-mode-select"]}${dangerClass}`}
          value={permissionMode}
          disabled={false}
          title={undefined}
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
