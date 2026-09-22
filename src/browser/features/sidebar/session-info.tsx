// サイドバーの「セッション情報」。モード・モデル・許可モード・キャラクター・セッションの
// `<select>`（共有部品。`src/browser/components/select.tsx`）を並べ、変更で `set-chat-mode` /
// `set-model` / `set-permission-mode` / `switch-character` を `dispatch` する。**次に届く
// `session-info` で `<select>` の選択が上書きされる**（サーバ側の値が正になる）。キャラクターの
// `<select>` は**選択肢が1つでも出す**（docs/design.md 7章）。
//
// **並びは寿命順ではなく触る頻度順**: モード → モデル → 許可モード → キャラクター →
// セッション。区画は内側スクロールなので、寿命順だと下の行が押し出されるため。

import { type ReactElement } from "react"

import { type CharacterPackChoice } from "../../../shared/character.ts"
import { isModelAlias, isPermissionMode } from "../../../shared/command.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { Select } from "../../components/select.tsx"
import { MODEL_LABELS, resolveModelAlias } from "../../lib/model-label.ts"
import {
  isDangerousPermissionMode,
  PERMISSION_MODE_LABELS,
  resolvePermissionMode,
} from "../../lib/permission-mode-label.ts"
import { useSessionDispatch, useSessionSelector } from "../../stores/session.tsx"
import { SessionSwitch } from "./session-switch.tsx"
import styles from "./sidebar.module.css"

// ラベルと畳み方（`resolveModelAlias` / `resolvePermissionMode`）は **帯の読みと同じものを読む**
// （`src/browser/lib/model-label.ts` / `permission-mode-label.ts`）。サイドバーは触らせる側、
// 帯は名乗る側で、**字は1箇所**にしておく（docs/design.md 13.9）。
const PERMISSION_MODE_SELECT_ID = "tsukumo-permission-mode"
const MODEL_SELECT_ID = "tsukumo-model"

const CHARACTER_SELECT_ID = "tsukumo-character"

// 雑談モードの `<select>`（docs/requirements.md 4.9 / docs/design.md 13.7）。**区画は増やさず**
// セッション情報の行を1つ足すだけ。切り替えは駆動の起こし直しなので、キャラクターの `<select>`
// と同じ条件（ターン進行中は塞ぐ）・同じ文言を使う。
const CHAT_MODE_SELECT_ID = "tsukumo-chat-mode"
const CHAT_MODE_WORK = "work"
const CHAT_MODE_CHAT = "chat"
const CHAT_MODE_LABELS: ReadonlyArray<readonly [string, string]> = [
  [CHAT_MODE_WORK, "仕事"],
  [CHAT_MODE_CHAT, "雑談"],
]

// 切り替えは起こし直し（会話が消える）なので、ターン進行中だけ塞ぐ。モデル・許可モードは
// 駆動へのコマンドで会話は消えないので、進行中でも塞がない。理由の文面は**サーバが断るときと
// 同じ1つ**（`shared` の定型文）を使う。
const CHARACTER_SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.switchDuringTurn

/**
 * `<select>` に選択済みで出すキャラクターパックの名前。**素材が1体ぶんしか無くても
 * `<select>` は出す**（無いように見えるほうが分かりにくい。docs/design.md 7章）ので、
 * いま出しているパックが分からないときは一覧の先頭に倒す。
 */
function resolveCharacterPack(
  packs: readonly CharacterPackChoice[],
  current: string | undefined,
): string {
  return packs.some((pack) => pack.name === current) ? (current ?? "") : (packs[0]?.name ?? "")
}

/**
 * `.session-info` は2列の grid（`sidebar.module.css`）で、ラベルと値（`<select>`）を
 * 直接の子として並べる。行ごとに別々の flex で並べると、ラベルの文字数の差がそのまま
 * `<select>` の左端のズレになるため、行の境目を div で区切らずグリッド1つに任せる。
 * `bypassPermissions` を選んでいるときは警告色を付ける
 * （`.permission-mode-select-danger`）。
 *
 * **段の切れ目は区切り線ではなく `row-gap` の分だけ余白を足して示す**（T-365。区画の下罫線と
 * 同じ太さの線を中に引くと3区画が6区画に見えるため）。段の境目に来る行は
 * `.session-info-group-start` / `-group-end` を持つ。**境目は「知らせ→モード」と
 * 「許可モード→キャラクター/セッション」の2箇所で固定**なので、その両端（モード＝段の先頭・
 * 許可モード＝段の末尾）にだけ付ける。知らせ・キャラクター・セッションはどれも0件のことがあり
 * `:nth-child` では境目の位置が動いてしまうため、両端は必ず出るモード・許可モードの側に付けて
 * 動かないようにする。
 */
export function SessionInfo(): ReactElement {
  const dispatch = useSessionDispatch()
  const characterPacks = useSessionSelector((session) => session.state.characterPacks)
  const currentPackName = useSessionSelector((session) => session.state.character?.pack)
  const turnInProgress = useSessionSelector((session) => session.state.turn.kind === "running")
  const chatMode = useSessionSelector((session) => session.state.chatMode)
  const modelName = useSessionSelector((session) => session.state.model)
  const permissionModeName = useSessionSelector((session) => session.state.permissionMode)
  const currentPack = resolveCharacterPack(characterPacks, currentPackName)
  const model = resolveModelAlias(modelName)
  const permissionMode = resolvePermissionMode(permissionModeName)
  const dangerClass = isDangerousPermissionMode(permissionMode)
    ? ` ${styles["permission-mode-select-danger"]}`
    : ""

  const groupStartLabelClass = `${styles["session-info-label"]} ${styles["session-info-group-start"] ?? ""}`
  const groupStartValueClass = `${styles["session-info-value"]} ${styles["session-info-group-start"] ?? ""}`
  const groupEndLabelClass = `${styles["session-info-label"]} ${styles["session-info-group-end"] ?? ""}`
  const groupEndValueClass = `${styles["session-info-value"]} ${styles["session-info-group-end"] ?? ""}`

  return (
    <div className={styles["session-info"]}>
      <label htmlFor={CHAT_MODE_SELECT_ID} className={groupStartLabelClass}>
        モード
      </label>
      <span className={groupStartValueClass}>
        <Select
          id={CHAT_MODE_SELECT_ID}
          ariaLabel="モード"
          className={styles["chat-mode-select"] ?? ""}
          value={chatMode ? CHAT_MODE_CHAT : CHAT_MODE_WORK}
          disabled={turnInProgress}
          title={turnInProgress ? CHARACTER_SWITCH_BLOCKED_TITLE : undefined}
          options={CHAT_MODE_LABELS.map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            dispatch({ type: "set-chat-mode", chat: value === CHAT_MODE_CHAT })
          }}
        />
      </span>
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
      <label htmlFor={PERMISSION_MODE_SELECT_ID} className={groupEndLabelClass}>
        許可モード
      </label>
      <span className={groupEndValueClass}>
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
      {characterPacks.length > 0 ? (
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
              disabled={turnInProgress}
              title={turnInProgress ? CHARACTER_SWITCH_BLOCKED_TITLE : undefined}
              options={characterPacks.map(({ name, label }) => ({ value: name, label }))}
              onChange={(value) => {
                dispatch({ type: "switch-character", name: value })
              }}
            />
          </span>
        </>
      ) : null}
      {/* セッションの行（`session-switch.tsx`）。**2列の grid の直の子**として並ぶよう、
          入れ物を挟まずラベルと値の対だけを返す部品にしてある。切り替え先が無ければ
          何も出さない。 */}
      <SessionSwitch />
    </div>
  )
}
