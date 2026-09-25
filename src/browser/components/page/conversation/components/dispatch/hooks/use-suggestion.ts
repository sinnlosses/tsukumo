// `<Composer>` の `/` と `@` 補完（docs/design.md 2章「機能の中を分ける」の
// 「container と対になっていないフック」。名前は概念で、container の `use-composer.ts` とは
// 別立て）。**出している候補・選んでいる位置・確定した下書きの3つ**（保つ・畳む）を持つ。
//
// 下書きそのもの（`Draft`）は `use-composer.ts` が持ったまま渡してくる。ここは受け取った下書きから
// 候補を畳み、確定したときの下書きを `onConfirmed` で返すだけで、`setDraft` もフォーカスの戻しも
// 呼び出し側の役目（`docs/design.md` 2章「機能の中を分ける」の表ではフックが state を持つが、
// ここは逆で、state の実体は呼び出し側にあるまま計算と確定だけをここへ出した）。
//
// **`/` と `@` の候補は同時に出ない。** どちらを出しているかは1つの判別可能な合併型
// （{@link ActiveSuggestions}）に畳んであり、選択位置と閉じたかどうかはその1つに対して持つ。
// 絞り方は `command-suggestions.tsx` / `file-suggestions.tsx` が持ち、`@` の候補の元
// （git 管理下のファイルのパス）を取るのは `conversation/components/hooks/use-repository-file-paths.ts`
// （外の世界に触るぶんだけ出したフック。`main-view/markdown/` も読むので `components/hooks/` にある）。

import { useState } from "react"

import { commandSuggestions } from "../../../../../../../shared/command-suggestion.ts"
import { type CommandDescription } from "../../../../../../../shared/session-event.ts"
import { useRepositoryFilePaths } from "../../hooks/use-repository-file-paths.ts"
import { matchingCommands, shouldShowCommandSuggestions } from "../command-suggestions.tsx"
import { type FilePathQuery, filePathQuery, matchingFilePaths } from "../file-suggestions.tsx"
import { type ComposerKey, type Draft } from "./use-composer.ts"

/** 入力欄の下のボタンが打つ、補完の合図の文字。 */
export type CompletionTrigger = "/" | "@"

/** いま出している候補。**`/` と `@` が同時に出ないことを型で保証する。** */
export type ActiveSuggestions =
  | { readonly kind: "none" }
  | { readonly kind: "command"; readonly matches: readonly CommandDescription[] }
  | {
      readonly kind: "file"
      readonly matches: readonly string[]
      readonly query: FilePathQuery
    }

export type UseSuggestionArgs = {
  readonly draft: Draft
  readonly pendingActive: boolean
  readonly slashCommands: readonly string[]
  readonly commandDescriptions: readonly CommandDescription[]
  /** 候補を確定した下書き。`setDraft` とフォーカスの戻しは呼び出し側で行う。 */
  readonly onConfirmed: (draft: Draft) => void
}

export type SuggestionModel = {
  readonly suggestions: ActiveSuggestions
  /** 候補の中で選んでいる位置（候補の件数に収めたもの）。 */
  readonly selectedIndex: number
  /** クリック（候補一覧の `onSelect`）での確定。 */
  readonly onSelect: (index: number) => void
  /**
   * ↑↓・Ctrl+P/N・Tab・Enter・Escape の読み替え。**呼び出し側は IME の変換中は呼ばない**
   * （送信の Enter と合図を共有するため、変換中かどうかは呼び出し側が見る）。読み替えて
   * 処理した（呼び出し側はこれ以上見なくてよい）なら true。
   */
  readonly onKeyDown: (event: ComposerKey) => boolean
  /** 下書きが変わった・補完のボタンを押した直後に呼ぶ（隠した状態を解き、選択位置を先頭へ戻す）。 */
  readonly reset: () => void
}

export function useSuggestion(args: UseSuggestionArgs): SuggestionModel {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const commandActive =
    !dismissed && shouldShowCommandSuggestions(args.draft.text, args.pendingActive)
  // `/` の候補が出ている間は `@` を見ない（同時に出さない）。
  const fileQuery =
    dismissed || args.pendingActive || commandActive
      ? undefined
      : filePathQuery(args.draft.text, args.draft.caret)
  const filePaths = useRepositoryFilePaths(fileQuery !== undefined)

  const suggestions: ActiveSuggestions = commandActive
    ? {
        kind: "command",
        matches: matchingCommands(
          commandSuggestions(args.slashCommands, args.commandDescriptions),
          args.draft.text,
        ),
      }
    : fileQuery === undefined
      ? { kind: "none" }
      : { kind: "file", matches: matchingFilePaths(filePaths, fileQuery.term), query: fileQuery }
  const matchCount = suggestionCount(suggestions)
  const clampedSelectedIndex = matchCount === 0 ? 0 : Math.min(selectedIndex, matchCount - 1)

  const select = (index: number): void => {
    const confirmed = confirmedDraft(suggestions, args.draft, index)
    if (confirmed === undefined) {
      return
    }
    args.onConfirmed(confirmed)
    setSelectedIndex(0)
  }

  return {
    suggestions,
    selectedIndex: clampedSelectedIndex,
    onSelect: select,
    onKeyDown: (event) => {
      if (matchCount === 0) {
        return false
      }
      if (event.key === "ArrowDown" || (event.ctrlKey && !event.metaKey && event.key === "n")) {
        event.preventDefault()
        setSelectedIndex((current) => (current + 1) % matchCount)
        return true
      }
      if (event.key === "ArrowUp" || (event.ctrlKey && !event.metaKey && event.key === "p")) {
        event.preventDefault()
        setSelectedIndex((current) => (current - 1 + matchCount) % matchCount)
        return true
      }
      if (event.key === "Tab" || event.key === "Enter") {
        // Tab・Enter のどちらも確定だけ（送信しない。docs/display.md 4.2）。
        event.preventDefault()
        select(clampedSelectedIndex)
        return true
      }
      if (event.key === "Escape") {
        setDismissed(true)
        return true
      }
      return false
    },
    reset: () => {
      setSelectedIndex(0)
      setDismissed(false)
    },
  }
}

/**
 * キャレットの位置に補完の合図の文字を差し込んだ下書き。**`@` は前が空白でなければ空白を
 * 1つ挟む**（`@` 補完は語の頭でしか開かない。`file-suggestions.tsx` の `filePathQuery`）。
 * `/` はそのまま差し込む（コマンドの補完が開くのは文面の頭だけで、それ以外の位置では
 * 1文字を打ったのと同じになる）。
 */
export function insertedTrigger(draft: Draft, caret: number, trigger: CompletionTrigger): Draft {
  const before = draft.text.slice(0, caret)
  const needsSpace = trigger === "@" && before !== "" && !/\s$/.test(before)
  const inserted = `${needsSpace ? " " : ""}${trigger}`
  return {
    text: `${before}${inserted}${draft.text.slice(caret)}`,
    caret: caret + inserted.length,
  }
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

/** 出している候補の件数（キー操作の分岐はこの数だけを見る）。 */
function suggestionCount(suggestions: ActiveSuggestions): number {
  return suggestions.kind === "none" ? 0 : suggestions.matches.length
}
