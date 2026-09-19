// 入力欄本体（<Composer>。docs/design.md 6.1）。`<textarea>` と `/` 補完
// （<CommandSuggestions>）を内包し、送信⇄中断（<TurnStatus>）を含む `<form>` を持つ。
//
// 入力欄の規則（docs/requirements.md 4.2「入力欄」。**規則は変えない**）:
// - Enter は改行、Command+Enter で送信。IME の変換確定の Command+Enter は送らない
//   （`isComposing` と、対応していない古いブラウザ向けの `keyCode === 229` の両方を見る）
// - 送信後は入力欄を空にしてフォーカスを残す
// - `/` 補完は前方一致→部分一致、Tab / Enter は確定だけ（送信しない）。選択の上下移動は
//   矢印キーに加えて Ctrl+P（前へ）/ Ctrl+N（次へ）でも行える（Meta 併用は無視）
//
// **下書き・候補の開閉と選択位置は `<Composer>` のローカル状態**（docs/design.md 6.2）。候補は
// `SessionState`（`commandSuggestions(state)`）と下書きの文字列から毎回計算するだけの導出値で、
// 別に持たない。

import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react"

import { commandSuggestions } from "../../../protocol/session-state.ts"
import { useSession } from "../../stores/session.tsx"
import {
  CommandSuggestions,
  matchingCommands,
  shouldShowCommandSuggestions,
} from "./command-suggestions.tsx"
import styles from "./dispatch.module.css"
import { TurnStatus } from "./turn-status.tsx"

const PLACEHOLDER_OPERATION_HINT = "（Enter で改行、Command+Enter で送信、/ でコマンド補完）"

/**
 * 入力欄のプレースホルダ。**依頼先はキャラクター**（2026-09-16
 * ユーザーの指摘。「claude」は素の呼び方で目的と食い違う）なので、`character.name`
 * から組み立てる。キャラクターがまだ届いていない・名前が無いときは、名前を使わずに
 * 依頼を書く操作だけを伝える（`"claude"` へ戻さない。原則4「キャラクターの中身を
 * コードに書かない」）。
 */
function composerPlaceholder(characterName: string | undefined): string {
  const subject = characterName === undefined ? "" : `${characterName}への`
  return `${subject}依頼を書く${PLACEHOLDER_OPERATION_HINT}`
}

/** IME の変換確定中か。`isComposing` に加え、対応していない古いブラウザ向けに `keyCode` も見る。 */
function isComposingEvent(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}

export function Composer(): ReactElement {
  const { state, dispatch } = useSession()
  const [text, setText] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

  const placeholder = composerPlaceholder(state.character?.name)
  const pendingActive = state.pending.length > 0
  const matches =
    suggestionsDismissed || !shouldShowCommandSuggestions(text, pendingActive)
      ? []
      : matchingCommands(commandSuggestions(state), text)
  const clampedSelectedIndex =
    matches.length === 0 ? 0 : Math.min(selectedIndex, matches.length - 1)

  const confirmSelected = (index: number): void => {
    const command = matches[index]
    if (command === undefined) {
      return
    }
    setText(`/${command.name} `)
    setSelectedIndex(0)
    textAreaRef.current?.focus()
  }

  const submit = (): void => {
    const trimmed = text.trim()
    if (trimmed === "") {
      return
    }
    dispatch({ type: "prompt", text: trimmed })
    setText("")
    setSelectedIndex(0)
    setSuggestionsDismissed(false)
    textAreaRef.current?.focus()
  }

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setText(event.target.value)
    setSelectedIndex(0)
    setSuggestionsDismissed(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const composing = isComposingEvent(event)

    if (!composing && matches.length > 0) {
      if (event.key === "ArrowDown" || (event.ctrlKey && !event.metaKey && event.key === "n")) {
        event.preventDefault()
        setSelectedIndex((current) => (current + 1) % matches.length)
        return
      }
      if (event.key === "ArrowUp" || (event.ctrlKey && !event.metaKey && event.key === "p")) {
        event.preventDefault()
        setSelectedIndex((current) => (current - 1 + matches.length) % matches.length)
        return
      }
      if (event.key === "Tab" || event.key === "Enter") {
        // Tab・Enter のどちらも確定だけ（送信しない。docs/requirements.md 4.2）。
        event.preventDefault()
        confirmSelected(clampedSelectedIndex)
        return
      }
      if (event.key === "Escape") {
        setSuggestionsDismissed(true)
        return
      }
    }

    if (event.key !== "Enter" || composing || !event.metaKey) {
      return
    }
    event.preventDefault()
    if (!state.turnInProgress) {
      submit()
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (state.turnInProgress) {
      return
    }
    submit()
  }

  return (
    <form className={styles["dispatch-form"]} onSubmit={handleSubmit}>
      <div className={styles["dispatch-text-wrap"]}>
        <textarea
          ref={textAreaRef}
          className={styles["dispatch-text"]}
          placeholder={placeholder}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          required
        />
        <CommandSuggestions
          matches={matches}
          selectedIndex={clampedSelectedIndex}
          onSelect={confirmSelected}
        />
      </div>
      <TurnStatus />
    </form>
  )
}
