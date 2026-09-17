// 「見た目」の引き出しの中の、**新しいキャラクターパックを作る口**（`docs/design.md` 7.1 / 13.6）。
// **常設の要素は1つも増えない** — 引き出し（`<dialog>`）の中に入るので、閉じている間は画面に
// 出ているボタンの数が変わらない（13.1 原則2）。
//
// 受け取るのは**名前・必須の2枚の立ち絵・差し色1色**だけで、表情を足す・衣装ごとに差し色を
// 分けるのは作ったあと `<CharacterEdit>` の側で行う（作る口は最低限にする）。
//
// **作っても切り替わらない。** 増えるのはサイドバーの `<select>` の選択肢で、切り替えは
// そこから選んだときだけ起きる（切り替えは駆動の起こし直しで画面が初期化されるので、作る操作の
// 副作用にしない。7.1）。
//
// **名前の形はサーバと同じ規則で先に見る**（`src/protocol/character.ts` の
// `isCharacterPackName`）。送ってから黙って落ちるのではなく、押せない理由を画面に出すため
// （`error` フレームは画面にまだ出していない）。

import { useState, type ReactElement } from "react"

import { isCharacterPackName, resolveExpressionLabel } from "../../../protocol/character.ts"
import { REQUIRED_EXPRESSIONS, type RequiredExpression } from "../../../protocol/expression.ts"
import { readDataUrl } from "../../lib/data-url.ts"
import { useSession } from "../../stores/session.tsx"
import { readAccentColor } from "./appearance-color.ts"

/** `<input type="file">` に出す受け付ける種類（`<CharacterEdit>` と同じ3つ）。 */
const PORTRAIT_FILE_ACCEPT = ".svg,.png,.gif"

const INVALID_NAME_NOTE = "名前に使えるのは半角の英数字と . _ - だけ（. では始められない）"
const TAKEN_NAME_NOTE = "その名前はもう使われている"
const CREATED_NOTE = "作った。サイドバーのキャラクターの一覧から切り替えられる"

/** 選んだ立ち絵（data URL）。**必須の2つぶん**で、そろうまで「作る」は押せない。 */
type HeldPortraits = Readonly<Record<RequiredExpression, string | undefined>>

const NO_PORTRAITS: HeldPortraits = { default: undefined, working: undefined }

export function CharacterCreate(): ReactElement | null {
  const { state, dispatch } = useSession()
  const [name, setName] = useState("")
  const [portraits, setPortraits] = useState<HeldPortraits>(NO_PORTRAITS)
  // 差し色の初期値は `--accent`（JS 側に既定の16進を持たない。`readAccentColor`）。
  const [accent, setAccent] = useState(readAccentColor)
  // 最後に送った名前。**作れたかどうかは一覧に出たかで見る**（`error` フレームは画面に
  // 出していないので、成否の手がかりはこれだけ）。
  const [sentName, setSentName] = useState<string | undefined>(undefined)
  const character = state.character
  // まだ `character-changed` が届いていない（接続直後の一瞬）。表情のラベルが決まらない。
  if (character === undefined) {
    return null
  }

  const taken = state.characterPacks.some((pack) => pack.name === name)
  const filled = REQUIRED_EXPRESSIONS.every((expression) => portraits[expression] !== undefined)
  const ready = isCharacterPackName(name) && !taken && filled

  /** 名前の欄の下に出す一言（何も言うことが無ければ undefined）。 */
  function note(): string | undefined {
    if (name === sentName && taken) {
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
    const workingImage = portraits.working
    if (!ready || defaultImage === undefined || workingImage === undefined) {
      return
    }

    dispatch({
      type: "create-character",
      name,
      portraits: { default: defaultImage, working: workingImage },
      accent,
    })
    setSentName(name)
  }

  const noteText = note()
  return (
    <fieldset className="appearance-fieldset">
      <legend>新しいキャラクター</legend>
      <div className="appearance-field">
        <label htmlFor="appearance-create-name">名前</label>
        <input
          id="appearance-create-name"
          type="text"
          className="appearance-create-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          // 引き出しは `<form method="dialog">` なので、Enter で閉じてしまわないように留める。
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
            }
          }}
        />
      </div>
      {REQUIRED_EXPRESSIONS.map((expression) => {
        const inputId = `appearance-create-portrait-${expression}`
        // 表情の呼び名はキャラクターごとの言葉なのでコードに持たない（原則4）。いま出している
        // パックのラベルを借りる（定義に無ければ表情名がそのまま出る）。
        const label = `${resolveExpressionLabel(character.expressions, expression)}の立ち絵`
        return (
          <div className="appearance-field" key={expression}>
            <label htmlFor={inputId}>{label}</label>
            <input
              id={inputId}
              type="file"
              className="appearance-portrait-file"
              accept={PORTRAIT_FILE_ACCEPT}
              onChange={(event) => {
                void holdPortrait(expression, event.currentTarget)
              }}
            />
          </div>
        )
      })}
      <div className="appearance-field">
        <label htmlFor="appearance-create-accent">差し色</label>
        <input
          id="appearance-create-accent"
          type="color"
          value={accent}
          onChange={(event) => setAccent(event.target.value)}
        />
      </div>
      {noteText === undefined ? null : <p className="appearance-note">{noteText}</p>}
      <button type="button" className="appearance-create-submit" disabled={!ready} onClick={create}>
        作る
      </button>
    </fieldset>
  )
}
