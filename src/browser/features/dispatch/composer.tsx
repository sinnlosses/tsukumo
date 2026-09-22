// 入力欄本体（<Composer>。docs/design.md 6.1）。`<textarea>` と補完の候補一覧
// （`/` の <CommandSuggestions>・`@` の <FileSuggestions>）を内包し、送信⇄中断（<TurnStatus>）を
// 含む `<form>` を持つ。
//
// 入力欄の規則（docs/requirements.md 4.2「入力欄」。**規則は変えない**）:
// - Enter は改行、Command+Enter で送信。IME の変換確定の Command+Enter は送らない
//   （`isComposing` と、対応していない古いブラウザ向けの `keyCode === 229` の両方を見る）
// - 送信後は入力欄を空にしてフォーカスを残す
// - `/` 補完は前方一致→部分一致、Tab / Enter は確定だけ（送信しない）。選択の上下移動は
//   矢印キーに加えて Ctrl+P（前へ）/ Ctrl+N（次へ）でも行える（Meta 併用は無視）
// - `@` 補完（git 管理下のファイルのパス）は同じキー操作で、確定すると `@<パス> ` が入る
//
// **`/` と `@` の候補は同時に出ない。** どちらを出しているかは1つの判別可能な合併型
// （{@link ActiveSuggestions}）に畳んであり、選択位置と閉じたかどうかはその1つに対して持つ。
//
// **下書き・候補の開閉と選択位置は `<Composer>` のローカル状態**（docs/design.md 6.2）。候補は
// 姿の `slashCommands` / `commandDescriptions`（`commandSuggestions`）・取得したファイルの一覧と、
// 下書きの文字列から毎回計算するだけの導出値で、別に持たない。

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react"

import { commandSuggestions } from "../../../shared/command-suggestion.ts"
import { MAX_PROMPT_IMAGES, type PromptImage } from "../../../shared/prompt-image.ts"
import { type CommandDescription } from "../../../shared/session-event.ts"
import { PromptImageChips } from "../../components/prompt-image.tsx"
import { carriesFiles, promptImageFiles, readPromptImage } from "../../lib/prompt-image.ts"
import { useSessionDispatch, useSessionSelector } from "../../stores/session.tsx"
import {
  CommandSuggestions,
  matchingCommands,
  shouldShowCommandSuggestions,
} from "./command-suggestions.tsx"
import styles from "./dispatch.module.css"
import {
  FileSuggestions,
  type FilePathQuery,
  filePathQuery,
  matchingFilePaths,
  useRepositoryFilePaths,
} from "./file-suggestions.tsx"
import { TurnStatus } from "./turn-status.tsx"

// **画像の受け取り方はボタンではなくこの1行で伝える**（操作子を増やさない。
// `docs/requirements.md` 4.10「受け取り方」）。
const PLACEHOLDER_OPERATION_HINT =
  "（Enter で改行、Command+Enter で送信、/ でコマンド補完、@ でファイル補完、画像は貼り付け）"

/** 打ちかけの文面と、その中のキャレットの位置。**2つで1つの状態**なので一緒に持つ。 */
type Draft = {
  readonly text: string
  readonly caret: number
}

const EMPTY_DRAFT: Draft = { text: "", caret: 0 }

/** いま出している候補。**`/` と `@` が同時に出ないことを型で保証する。** */
type ActiveSuggestions =
  | { readonly kind: "none" }
  | { readonly kind: "command"; readonly matches: readonly CommandDescription[] }
  | {
      readonly kind: "file"
      readonly matches: readonly string[]
      readonly query: FilePathQuery
    }

/**
 * 入力欄のプレースホルダ。**依頼先はキャラクター**（「claude」は素の呼び方で目的と食い違う）
 * なので、`character.name` から組み立てる。キャラクターがまだ届いていない・名前が無いときは、
 * 名前を使わずに依頼を書く操作だけを伝える（`"claude"` へ戻さない。原則4「キャラクターの中身を
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

/** 出している候補の件数（キー操作の分岐はこの数だけを見る）。 */
function suggestionCount(suggestions: ActiveSuggestions): number {
  return suggestions.kind === "none" ? 0 : suggestions.matches.length
}

/**
 * 候補を1つ確定したあとの下書き。確定できる候補が無ければ undefined。
 *
 * `/` は**文面を丸ごと**置き換え（先頭のコマンドだけの状態でしか出ない）、`@` は**キャレットの
 * 直前の `@<打ちかけ>` だけ**を置き換える（前後に書いた文は触らない）。どちらも末尾に空白を
 * 1つ足して、続けて引数やパスを打ち始められるようにする（`@` は**すぐ後ろがすでに空白なら
 * 足さない**。文の途中で確定したときに空白が2つ並ばないため）。
 */
function confirmedDraft(
  suggestions: ActiveSuggestions,
  draft: Draft,
  index: number,
): Draft | undefined {
  if (suggestions.kind === "command") {
    const command = suggestions.matches[index]
    if (command === undefined) {
      return undefined
    }
    const text = `/${command.name} `
    return { text, caret: text.length }
  }

  if (suggestions.kind === "file") {
    const path = suggestions.matches[index]
    if (path === undefined) {
      return undefined
    }
    const { start, end } = suggestions.query
    const following = draft.text[end]
    const inserted = `@${path}${following !== undefined && /\s/.test(following) ? "" : " "}`
    return {
      text: `${draft.text.slice(0, start)}${inserted}${draft.text.slice(end)}`,
      caret: start + inserted.length,
    }
  }

  return undefined
}

export function Composer(): ReactElement {
  const dispatch = useSessionDispatch()
  const characterName = useSessionSelector((session) => session.state.character?.name)
  const pendingActive = useSessionSelector((session) => session.state.pending.length > 0)
  const turnInProgress = useSessionSelector((session) => session.state.turnInProgress)
  const slashCommands = useSessionSelector((session) => session.state.slashCommands)
  const commandDescriptions = useSessionSelector((session) => session.state.commandDescriptions)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  // 添えた画像（送るまでの間だけ持つ）。**原寸もここにしか無く**、送った時点で捨てる
  // （`docs/requirements.md` 4.10。`localStorage` にもディスクにも置かない）。
  const [images, setImages] = useState<readonly PromptImage[]>([])
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

  const placeholder = composerPlaceholder(characterName)
  const commandActive =
    !suggestionsDismissed && shouldShowCommandSuggestions(draft.text, pendingActive)
  // `/` の候補が出ている間は `@` を見ない（同時に出さない）。
  const fileQuery =
    suggestionsDismissed || pendingActive || commandActive
      ? undefined
      : filePathQuery(draft.text, draft.caret)
  const filePaths = useRepositoryFilePaths(fileQuery !== undefined)

  const suggestions: ActiveSuggestions = commandActive
    ? {
        kind: "command",
        matches: matchingCommands(
          commandSuggestions(slashCommands, commandDescriptions),
          draft.text,
        ),
      }
    : fileQuery === undefined
      ? { kind: "none" }
      : { kind: "file", matches: matchingFilePaths(filePaths, fileQuery.term), query: fileQuery }
  const matchCount = suggestionCount(suggestions)
  const clampedSelectedIndex = matchCount === 0 ? 0 : Math.min(selectedIndex, matchCount - 1)

  // React が `value` を書いたあと、キャレットは文面の末尾へ飛ぶ。文の途中で `@` を確定したときは
  // 差し込んだ直後へ戻す（React の外にある状態への書き込み。打っている間は位置が一致するので
  // 何もしない）。
  useEffect(() => {
    const textArea = textAreaRef.current
    if (textArea !== null && textArea.selectionStart !== draft.caret) {
      textArea.setSelectionRange(draft.caret, draft.caret)
    }
  }, [draft])

  const confirmSelected = (index: number): void => {
    const confirmed = confirmedDraft(suggestions, draft, index)
    if (confirmed === undefined) {
      return
    }
    setDraft(confirmed)
    setSelectedIndex(0)
    textAreaRef.current?.focus()
  }

  const submit = (): void => {
    const trimmed = draft.text.trim()
    if (trimmed === "") {
      return
    }
    dispatch({ type: "prompt", text: trimmed, images })
    setDraft(EMPTY_DRAFT)
    // **送った時点で原寸を手放す**（札が消え、以降どこからも開けない）。
    setImages([])
    setSelectedIndex(0)
    setSuggestionsDismissed(false)
    textAreaRef.current?.focus()
  }

  /**
   * 貼られた・落ちてきたファイルを札に足す。**枚数の上限（{@link MAX_PROMPT_IMAGES}）で頭を
   * 打ち**、読めなかった1枚は黙って落ちる（画面は1回の失敗で落ちない）。
   */
  const attachFiles = (files: readonly File[]): void => {
    void (async () => {
      const read = await Promise.all(files.slice(0, MAX_PROMPT_IMAGES).map(readPromptImage))
      const added = read.flatMap((image) => (image === undefined ? [] : [image]))
      if (added.length === 0) {
        return
      }
      setImages((current) => [...current, ...added].slice(0, MAX_PROMPT_IMAGES))
    })()
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = promptImageFiles(event.clipboardData)
    if (files.length === 0) {
      return
    }
    // 画像を貼ったときだけ既定の貼り付けを止める（文字の貼り付けはそのまま通す）。
    event.preventDefault()
    attachFiles(files)
  }

  const handleDragOver = (event: DragEvent<HTMLTextAreaElement>): void => {
    // ファイルを掴んできたときだけ落とせるようにする（文字のドラッグは `<textarea>` の
    // 既定の振る舞いのまま）。
    if (carriesFiles(event.dataTransfer)) {
      event.preventDefault()
    }
  }

  const handleDrop = (event: DragEvent<HTMLTextAreaElement>): void => {
    const files = promptImageFiles(event.dataTransfer)
    if (files.length === 0) {
      return
    }
    event.preventDefault()
    attachFiles(files)
  }

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft({ text: event.target.value, caret: event.target.selectionStart })
    setSelectedIndex(0)
    setSuggestionsDismissed(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const composing = isComposingEvent(event)

    if (!composing && matchCount > 0) {
      if (event.key === "ArrowDown" || (event.ctrlKey && !event.metaKey && event.key === "n")) {
        event.preventDefault()
        setSelectedIndex((current) => (current + 1) % matchCount)
        return
      }
      if (event.key === "ArrowUp" || (event.ctrlKey && !event.metaKey && event.key === "p")) {
        event.preventDefault()
        setSelectedIndex((current) => (current - 1 + matchCount) % matchCount)
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
    if (!turnInProgress) {
      submit()
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (turnInProgress) {
      return
    }
    submit()
  }

  return (
    <form className={styles["dispatch-form"]} onSubmit={handleSubmit}>
      <div className={styles["dispatch-text-wrap"]}>
        <PromptImageChips
          images={images}
          onRemove={(index) => {
            setImages((current) => current.filter((_, at) => at !== index))
          }}
        />
        <textarea
          ref={textAreaRef}
          className={styles["dispatch-text"]}
          placeholder={placeholder}
          value={draft.text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          required
        />
        {suggestions.kind === "command" && (
          <CommandSuggestions
            matches={suggestions.matches}
            selectedIndex={clampedSelectedIndex}
            onSelect={confirmSelected}
          />
        )}
        {suggestions.kind === "file" && (
          <FileSuggestions
            matches={suggestions.matches}
            selectedIndex={clampedSelectedIndex}
            onSelect={confirmSelected}
          />
        )}
      </div>
      <TurnStatus />
    </form>
  )
}
