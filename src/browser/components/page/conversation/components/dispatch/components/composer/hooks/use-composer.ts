// `<Composer>` のロジック。
// 下書き・質問の帯を持ち、送信とキーの読み替え（補完へ回すか・送信するか）を持つ（送信の Enter と補完のキーが同じ `keydown` を共有するため）。
//
// 入力欄の規則:
// - Enter は改行、Command+Enter で送信。IME の変換確定の Command+Enter は送らない
//   （`isComposing` と、対応していない古いブラウザ向けの `keyCode === 229` の両方を見る）
// - 送信後は入力欄を空にしてフォーカスを残す
// - `/` 補完は前方一致→部分一致、Tab / Enter は確定だけ（送信しない）。選択の上下移動は
//   矢印キーに加えて Ctrl+P（前へ）/ Ctrl+N（次へ）でも行える（Meta 併用は無視）
// - `@` 補完（git 管理下のファイルのパス）は同じキー操作で、確定すると `@<パス> ` が入る
// - 入力欄の下の `/` と `@` のボタンは、キャレットの位置にその1文字を打つのと同じ
//   （補完が開くかどうかは打ったときと同じ規則で決まる。`@` は前が空白でなければ空白を挟む）

import { useEffect, useRef, useState, type RefObject } from "react"

import { useQuestionAnswer } from "../../../../../../../../stores/question-answer.ts"
import { useSession, useTurnRunning } from "../../../../../../../../stores/session.ts"
import type { ComposerKey, ComposerSurface, Draft } from "../../../domain/composer-surface.ts"
import { loadComposerMode, saveComposerMode, type ComposerMode } from "../domain/composer-mode.ts"
import { usePromptImage, type PromptImageModel } from "./use-prompt-image.ts"
import {
  insertedTrigger,
  useSuggestion,
  type ActiveSuggestions,
  type CompletionTrigger,
} from "./use-suggestion.ts"

const EMPTY_DRAFT: Draft = { text: "", caret: 0 }

/**
 * `<textarea>` の上の帯。答え待ちの質問のときだけ出す。
 * 答えはメインビューの選択肢の札から選ぶか、ここに書いて送る。
 */
export type ComposerBand =
  | { readonly kind: "none" }
  | { readonly kind: "question"; readonly text: string }

/**
 * `<Composer>` が画面に出す形。
 * 画像まわりは `PromptImageModel` のまま（`reset` は container の中だけで使うので外へは出さない）。
 */
export type ComposerModel = Omit<PromptImageModel, "reset"> & {
  /** 入力欄の面。確定・送信のあとにフォーカスを戻し、キャレットを置き直す。 */
  readonly surfaceRef: RefObject<ComposerSurface | null>
  readonly mode: ComposerMode
  /** 面を `<textarea>` とマークダウンエディタの間で切り替える。下書きはそのまま引き継ぐ。 */
  readonly onToggleMode: () => void
  readonly placeholder: string
  /** `<textarea>` の上の帯（質問に答えている間だけ出る）。 */
  readonly band: ComposerBand
  /** 質問に答えている間か（枠を `--state-warn` にし、送るボタンの字を変える）。 */
  readonly answering: boolean
  readonly draft: Draft
  readonly suggestions: ActiveSuggestions
  /** 候補の中で選んでいる位置（候補の件数に収めたもの）。 */
  readonly selectedIndex: number
  readonly onSelectSuggestion: (index: number) => void
  readonly onChange: (draft: Draft) => void
  /** 処理した（面の既定の振る舞いへ流さない）なら true。 */
  readonly onKeyDown: (event: ComposerKey) => boolean
  readonly onSubmit: (event: { readonly preventDefault: () => void }) => void
  /** `/` / `@` のボタン。キャレットの位置にその文字を打ち、入力欄へフォーカスを戻す。 */
  readonly onInsertTrigger: (trigger: CompletionTrigger) => void
}

export function useComposer(): ComposerModel {
  const dispatch = useSession((session) => session.dispatch)
  const characterName = useSession((session) => session.state.character?.name)
  const pendingActive = useSession((session) => session.state.pending.length > 0)
  const turnInProgress = useTurnRunning()
  // 答え待ちの質問があるあいだ、入力欄は「依頼を書く場所」ではなく選択肢以外の答えを書く場所になる（札はメインビューに出ている）。
  const question = useQuestionAnswer()
  const slashCommands = useSession((session) => session.state.slashCommands)
  const commandDescriptions = useSession((session) => session.state.commandDescriptions)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const surfaceRef = useRef<ComposerSurface | null>(null)
  const [mode, setMode] = useState<ComposerMode>(loadComposerMode)

  const suggestion = useSuggestion({
    draft,
    pendingActive,
    slashCommands,
    commandDescriptions,
    onConfirmed: (confirmed) => {
      setDraft(confirmed)
      surfaceRef.current?.focus()
    },
  })
  const { reset: resetPromptImage, ...promptImage } = usePromptImage({
    focusSurface: () => {
      surfaceRef.current?.focus()
    },
  })

  // 面が文面を書き直したあと、キャレットは文面の末尾へ飛ぶことがある。
  // 文の途中で `@` を確定したときは差し込んだ直後へ戻す（打っている間は位置が一致するので何もしない）。
  useEffect(() => {
    const surface = surfaceRef.current
    if (surface !== null && surface.caret() !== draft.caret) {
      surface.placeCaret(draft.caret)
    }
  }, [draft])

  const submit = (): void => {
    const trimmed = draft.text.trim()
    if (trimmed === "") {
      return
    }
    if (question.kind === "asking") {
      // 質問に答えている間は依頼として送らない（打った字はいま見ている1問の答えになる）。
      question.onAnswerWithText(trimmed)
    } else {
      dispatch.session.prompt({ text: trimmed, images: promptImage.images })
    }
    setDraft(EMPTY_DRAFT)
    resetPromptImage()
    suggestion.reset()
    surfaceRef.current?.focus()
  }

  const insertTrigger = (trigger: CompletionTrigger): void => {
    // ボタンを押した時点で入力欄のフォーカスは外れているが、選択の位置は残っている。
    // 打っていない間にキャレットを動かしただけでは下書きの `caret` は追いつかないので、入力欄から読めるならそちらを使う。
    setDraft(insertedTrigger(draft, surfaceRef.current?.caret() ?? draft.caret, trigger))
    suggestion.reset()
    surfaceRef.current?.focus()
  }

  return {
    ...promptImage,
    surfaceRef,
    mode,
    onToggleMode: () => {
      // 打たずに動かしたキャレットは下書きに入っていないので、いまの面から読んで次の面へ渡す。
      setDraft({ text: draft.text, caret: surfaceRef.current?.caret() ?? draft.caret })
      const next = mode === "plain" ? "markdown" : "plain"
      setMode(next)
      saveComposerMode(next)
    },
    placeholder:
      question.kind === "asking" ? ANSWER_PLACEHOLDER : composerPlaceholder(characterName),
    band:
      question.kind === "asking"
        ? { kind: "question", text: questionBandText(characterName) }
        : { kind: "none" },
    answering: question.kind === "asking",
    draft,
    suggestions: suggestion.suggestions,
    selectedIndex: suggestion.selectedIndex,
    onSelectSuggestion: suggestion.onSelect,
    onChange: (changed) => {
      setDraft(changed)
      suggestion.reset()
    },
    onKeyDown: (event) => {
      const composing = isComposingEvent(event)

      if (!composing && suggestion.onKeyDown(event)) {
        return true
      }

      if (event.key !== "Enter" || composing || !event.metaKey) {
        return false
      }
      event.preventDefault()
      // 質問に答えている間はターンが進行中でも送れる（答えを待っているのは SDK のほう）。
      if (!turnInProgress || question.kind === "asking") {
        submit()
      }
      return true
    },
    onSubmit: (event) => {
      event.preventDefault()
      if (turnInProgress && question.kind !== "asking") {
        return
      }
      submit()
    },
    onInsertTrigger: insertTrigger,
  }
}

/** 質問に答えている間のプレースホルダ（選択肢の札はメインビューに出ている）。 */
const ANSWER_PLACEHOLDER = "選択肢以外の答えを書く…"

/** `<textarea>` の上の帯の文言。誰が聞いているかを名前で言い、名前が無いパックでは名前を使わずに書く。 */
function questionBandText(characterName: string | undefined): string {
  const subject = characterName === undefined ? "" : `${characterName} が`
  return `↑ ${subject}質問しています。上の選択肢から選ぶか、ここに書いて答えてください`
}

/**
 * 入力欄のプレースホルダ。依頼先はキャラクターなので、`character.name` から組み立てる。
 * キャラクターがまだ届いていない・名前が無いときは、名前を使わずに依頼を書く操作だけを伝える（`"claude"` へ戻さない）。
 */
function composerPlaceholder(characterName: string | undefined): string {
  const subject = characterName === undefined ? "" : `${characterName} への`
  return `${subject}依頼を書く`
}

/** IME の変換確定中か。`isComposing` に加え、対応していない古いブラウザ向けに `keyCode` も見る。 */
function isComposingEvent(event: ComposerKey): boolean {
  return event.isComposing || event.keyCode === 229
}
