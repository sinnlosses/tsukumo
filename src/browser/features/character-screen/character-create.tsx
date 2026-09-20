// **新しいキャラクターパックを作る画面**（`#character/new`。`docs/design.md` 7.1 / 13.6）。
// キャラクター画面から入り、左上の「← キャラクターへ戻る」で戻る。
//
// 受け取るのは**名前・必須の立ち絵1枚・差し色1色**だけで、表情を足す・衣装ごとに差し色を
// 分けるのは作ったあと `<CharacterEdit>` の側で行う（作る口は最低限にする）。
//
// **作っても自動では切り替わらない**（切り替えは駆動の起こし直しで画面が初期化されるので、
// 作る操作の副作用にしない。7.1）。作れたら「このキャラクターに切り替える」を出し、
// **押したときだけ** `switch-character` を送ってキャラクター画面へ戻る。ターン進行中は
// 押せない（サイドバーの `<select>` と同じ理由・同じ文言）。
//
// **名前の形はサーバと同じ規則で先に見る**（`src/shared/character.ts` の
// `isCharacterPackName`）。送ってから黙って落ちるのではなく、押せない理由を画面に出すため
// （`error` フレームは画面にまだ出していない）。

import { useState, type ReactElement } from "react"

import { isCharacterPackName } from "../../../shared/character.ts"
import { resolveExpressionLabel } from "../../../shared/expression-choice.ts"
import { REQUIRED_EXPRESSIONS, type RequiredExpression } from "../../../shared/expression.ts"
import { FRAME_ERROR_REASON } from "../../../shared/frame.ts"
import { readDataUrl } from "../../lib/data-url.ts"
import { navigateTo, screenHash } from "../../stores/screen.tsx"
import { useSession } from "../../stores/session.tsx"
import { readAccentColor } from "./appearance-color.ts"
import styles from "./character-screen.module.css"

/** `<input type="file">` に出す受け付ける種類（`<CharacterEdit>` と同じ3つ）。 */
const PORTRAIT_FILE_ACCEPT = ".svg,.png,.gif"

const INVALID_NAME_NOTE = "名前に使えるのは半角の英数字と . _ - だけ（. では始められない）"
const TAKEN_NAME_NOTE = "その名前はもう使われている"
const CREATED_NOTE = "作った。"

// 切り替えは起こし直し（会話が消える）なので、ターン進行中だけ塞ぐ。理由の文面は**サーバが
// 断るときと同じ1つ**（`shared` の定型文）を使う（サイドバーの `<select>` と同じ）。
const SWITCH_BLOCKED_TITLE = FRAME_ERROR_REASON.switchDuringTurn

/** 選んだ立ち絵（data URL）。**必須の1つぶん**で、そろうまで「作る」は押せない。 */
type HeldPortraits = Readonly<Record<RequiredExpression, string | undefined>>

const NO_PORTRAITS: HeldPortraits = { default: undefined }

export function CharacterCreate(): ReactElement {
  const { state, dispatch } = useSession()
  const [name, setName] = useState("")
  const [portraits, setPortraits] = useState<HeldPortraits>(NO_PORTRAITS)
  // 差し色の初期値は `--accent`（JS 側に既定の16進を持たない。`readAccentColor`）。
  const [accent, setAccent] = useState(readAccentColor)
  // 最後に送った名前。**作れたかどうかは一覧に出たかで見る**（`error` フレームは画面に
  // 出していないので、成否の手がかりはこれだけ）。
  const [sentName, setSentName] = useState<string | undefined>(undefined)
  const character = state.character

  const taken = state.characterPacks.some((pack) => pack.name === name)
  const filled = REQUIRED_EXPRESSIONS.every((expression) => portraits[expression] !== undefined)
  const ready = isCharacterPackName(name) && !taken && filled
  // 送った名前が一覧に出た ＝ サーバ側に書けた。
  const created = sentName !== undefined && name === sentName && taken

  /** 名前の欄の下に出す一言（何も言うことが無ければ undefined）。 */
  function note(): string | undefined {
    if (created) {
      return CREATED_NOTE
    }
    if (taken) {
      return TAKEN_NAME_NOTE
    }
    return name !== "" && !isCharacterPackName(name) ? INVALID_NAME_NOTE : undefined
  }

  /** 選ばれた画像を data URL にして持つ（送るのは「作る」を押したとき1回だけ）。 */
  async function holdPortrait(
    expression: RequiredExpression,
    input: HTMLInputElement,
  ): Promise<void> {
    const file = input.files?.[0]
    if (file === undefined) {
      return
    }

    const image = await readDataUrl(file)
    if (image !== undefined) {
      setPortraits((held) => ({ ...held, [expression]: image }))
    }
  }

  function create(): void {
    const defaultImage = portraits.default
    if (!ready || defaultImage === undefined) {
      return
    }

    dispatch({
      type: "create-character",
      name,
      portraits: { default: defaultImage },
      accent,
    })
    setSentName(name)
  }

  /** 作ったパックへ切り替えて、キャラクター画面へ戻る（整える続きはそちらで行う）。 */
  function switchToCreated(): void {
    if (sentName === undefined) {
      return
    }
    dispatch({ type: "switch-character", name: sentName })
    navigateTo("character")
  }

  const noteText = note()
  return (
    <div className={styles["character-screen"]}>
      <div className={styles["character-screen-bar"]}>
        <a className={styles["character-screen-back"]} href={screenHash("character")}>
          ← キャラクターへ戻る
        </a>
      </div>
      {/* まだ `character-changed` が届いていない（接続直後の一瞬）間は、表情のラベルが
          決まらないので口を出さない。**戻る口だけは常に出す**（行き止まりにしない）。 */}
      {character === undefined ? null : (
        <fieldset className={styles["character-screen-fieldset"]}>
          <legend>新しいキャラクター</legend>
          <div className={styles["character-screen-field"]}>
            <label htmlFor="character-create-name">名前</label>
            <input
              id="character-create-name"
              type="text"
              className={styles["character-screen-create-name"]}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {REQUIRED_EXPRESSIONS.map((expression) => {
            const inputId = `character-create-portrait-${expression}`
            // 表情の呼び名はキャラクターごとの言葉なのでコードに持たない（原則4）。いま出している
            // パックのラベルを借りる（定義に無ければ表情名がそのまま出る）。
            const label = `${resolveExpressionLabel(character.expressions, expression)}の立ち絵`
            return (
              <div className={styles["character-screen-field"]} key={expression}>
                <label htmlFor={inputId}>{label}</label>
                <input
                  id={inputId}
                  type="file"
                  className={styles["character-screen-create-file"]}
                  accept={PORTRAIT_FILE_ACCEPT}
                  onChange={(event) => {
                    void holdPortrait(expression, event.currentTarget)
                  }}
                />
              </div>
            )
          })}
          <div className={styles["character-screen-field"]}>
            <label htmlFor="character-create-accent">差し色</label>
            <input
              id="character-create-accent"
              type="color"
              value={accent}
              onChange={(event) => setAccent(event.target.value)}
            />
          </div>
          {noteText === undefined ? null : (
            <p className={styles["character-screen-note"]}>
              {noteText}
              {created ? (
                <button
                  type="button"
                  className={styles["character-screen-switch"]}
                  disabled={state.turnInProgress}
                  title={state.turnInProgress ? SWITCH_BLOCKED_TITLE : undefined}
                  onClick={switchToCreated}
                >
                  このキャラクターに切り替える
                </button>
              ) : null}
            </p>
          )}
          <button
            type="button"
            className={styles["character-screen-create-submit"]}
            disabled={!ready}
            onClick={create}
          >
            作る
          </button>
        </fieldset>
      )}
    </div>
  )
}
