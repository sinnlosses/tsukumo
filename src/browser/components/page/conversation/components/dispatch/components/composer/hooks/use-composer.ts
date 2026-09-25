// `<Composer>` のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 下書き・添えた画像・質問の帯を持ち、キーと貼り付け・ドロップを読み替えて、presenter がそのまま
// 置ける値と呼び先を返す。
//
// 入力欄の規則（docs/display.md 4.2「入力欄」。**規則は変えない**）:
// - Enter は改行、Command+Enter で送信。IME の変換確定の Command+Enter は送らない
//   （`isComposing` と、対応していない古いブラウザ向けの `keyCode === 229` の両方を見る）
// - 送信後は入力欄を空にしてフォーカスを残す
// - `/` 補完は前方一致→部分一致、Tab / Enter は確定だけ（送信しない）。選択の上下移動は
//   矢印キーに加えて Ctrl+P（前へ）/ Ctrl+N（次へ）でも行える（Meta 併用は無視）
// - `@` 補完（git 管理下のファイルのパス）は同じキー操作で、確定すると `@<パス> ` が入る
// - 入力欄の下の `/` と `@` のボタンは、**キャレットの位置にその1文字を打つのと同じ**
//   （補完が開くかどうかは打ったときと同じ規則で決まる。`@` は前が空白でなければ空白を挟む）
//
// **補完の状態（出している候補・選んでいる位置）と確定の手は `hooks/use-suggestion.ts` が、
// 添えた画像の持ち方と取り込みは `hooks/use-prompt-image.ts` が持つ**（docs/design.md 2章
// 「機能の中を分ける」。どちらも container と対になっていないフックで、下書きの実体はここに
// 残したまま渡す）。ここは下書き・質問の帯を持ち、送信とキーの読み替え（補完へ回すか・送信
// するか）を持つ（送信の Enter と補完のキーが同じ `keydown` を共有するため）。

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react"

import { useQuestionAnswer } from "../../../../../../../../stores/question-answer.tsx"
import {
  useSessionDispatch,
  useSessionSelector,
  useTurnRunning,
} from "../../../../../../../../stores/session.tsx"
import { usePromptImage, type PromptImageModel } from "./use-prompt-image.ts"
import {
  insertedTrigger,
  useSuggestion,
  type ActiveSuggestions,
  type CompletionTrigger,
} from "./use-suggestion.ts"

/** 打ちかけの文面と、その中のキャレットの位置。**2つで1つの状態**なので一緒に持つ。 */
export type Draft = {
  readonly text: string
  readonly caret: number
}

const EMPTY_DRAFT: Draft = { text: "", caret: 0 }

/** キーの読み替えに使う値（`<textarea>` の `keydown` から、見るものだけ）。 */
export type ComposerKey = Pick<
  KeyboardEvent<HTMLTextAreaElement>,
  "key" | "ctrlKey" | "metaKey" | "keyCode" | "preventDefault"
> & {
  readonly nativeEvent: Pick<globalThis.KeyboardEvent, "isComposing">
}

/** 打ったときに読む値（`<textarea>` の `change` から、見るものだけ）。 */
export type ComposerChange = {
  readonly target: Pick<HTMLTextAreaElement, "value" | "selectionStart">
}

/**
 * `<textarea>` の上の帯。**答え待ちの質問のときだけ出す**（答えは選択肢の札から選ぶか、
 * ここに書いて送る。札は
 * `components/page/conversation/components/main-view/components/question-ask/question-ask.tsx`）。
 */
export type ComposerBand =
  | { readonly kind: "none" }
  | { readonly kind: "question"; readonly text: string }

/**
 * `<Composer>` が画面に出す形。presenter はこれをそのまま置くだけ。**画像まわり
 * （`imageInputRef` から `onImagesChosen` まで）は `hooks/use-prompt-image.ts` の
 * `PromptImageModel` と同じ形**（`reset` は container の中だけで使うので外へは出さない）。
 */
export type ComposerModel = Omit<PromptImageModel, "reset"> & {
  /** `<textarea>` の入れ物。確定・送信のあとにフォーカスを戻し、キャレットを置き直す。 */
  readonly textAreaRef: RefObject<HTMLTextAreaElement | null>
  readonly placeholder: string
  /** `<textarea>` の上の帯（質問に答えている間だけ出る）。 */
  readonly band: ComposerBand
  /** 質問に答えている間か（枠を `--state-warn` にし、送るボタンの字を変える）。 */
  readonly answering: boolean
  readonly text: string
  readonly suggestions: ActiveSuggestions
  /** 候補の中で選んでいる位置（候補の件数に収めたもの）。 */
  readonly selectedIndex: number
  readonly onSelectSuggestion: (index: number) => void
  readonly onChange: (event: ComposerChange) => void
  readonly onKeyDown: (event: ComposerKey) => void
  readonly onSubmit: (event: { readonly preventDefault: () => void }) => void
  /** `/` / `@` のボタン。キャレットの位置にその文字を打ち、入力欄へフォーカスを戻す。 */
  readonly onInsertTrigger: (trigger: CompletionTrigger) => void
}

export function useComposer(): ComposerModel {
  const dispatch = useSessionDispatch()
  const characterName = useSessionSelector((session) => session.state.character?.name)
  const pendingActive = useSessionSelector((session) => session.state.pending.length > 0)
  const turnInProgress = useTurnRunning()
  // 答え待ちの質問があるあいだ、入力欄は「依頼を書く場所」ではなく**選択肢以外の答えを書く
  // 場所**になる（札はメインビューに出ている。`stores/question-answer.tsx`）。
  const question = useQuestionAnswer()
  const slashCommands = useSessionSelector((session) => session.state.slashCommands)
  const commandDescriptions = useSessionSelector((session) => session.state.commandDescriptions)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

  const suggestion = useSuggestion({
    draft,
    pendingActive,
    slashCommands,
    commandDescriptions,
    onConfirmed: (confirmed) => {
      setDraft(confirmed)
      textAreaRef.current?.focus()
    },
  })
  const { reset: resetPromptImage, ...promptImage } = usePromptImage({
    focusTextArea: () => {
      textAreaRef.current?.focus()
    },
  })

  // React が `value` を書いたあと、キャレットは文面の末尾へ飛ぶ。文の途中で `@` を確定したときは
  // 差し込んだ直後へ戻す（React の外にある状態への書き込み。打っている間は位置が一致するので
  // 何もしない）。
  useEffect(() => {
    const textArea = textAreaRef.current
    if (textArea !== null && textArea.selectionStart !== draft.caret) {
      textArea.setSelectionRange(draft.caret, draft.caret)
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
    textAreaRef.current?.focus()
  }

  const insertTrigger = (trigger: CompletionTrigger): void => {
    // ボタンを押した時点で入力欄のフォーカスは外れているが、選択の位置は残っている。
    // **打っていない間にキャレットを動かしただけでは下書きの `caret` は追いつかない**ので、
    // 入力欄から読めるならそちらを使う。
    setDraft(insertedTrigger(draft, textAreaRef.current?.selectionStart ?? draft.caret, trigger))
    suggestion.reset()
    textAreaRef.current?.focus()
  }

  return {
    ...promptImage,
    textAreaRef,
    placeholder:
      question.kind === "asking" ? ANSWER_PLACEHOLDER : composerPlaceholder(characterName),
    band:
      question.kind === "asking"
        ? { kind: "question", text: questionBandText(characterName) }
        : { kind: "none" },
    answering: question.kind === "asking",
    text: draft.text,
    suggestions: suggestion.suggestions,
    selectedIndex: suggestion.selectedIndex,
    onSelectSuggestion: suggestion.onSelect,
    onChange: (event) => {
      setDraft({ text: event.target.value, caret: event.target.selectionStart })
      suggestion.reset()
    },
    onKeyDown: (event) => {
      const composing = isComposingEvent(event)

      if (!composing && suggestion.onKeyDown(event)) {
        return
      }

      if (event.key !== "Enter" || composing || !event.metaKey) {
        return
      }
      event.preventDefault()
      // 質問に答えている間はターンが進行中でも送れる（答えを待っているのは SDK のほう）。
      if (!turnInProgress || question.kind === "asking") {
        submit()
      }
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

/**
 * `<textarea>` の上の帯の文言。**誰が聞いているか**を名前で言う（原則4「キャラクターの中身を
 * コードに書かない」に従い、名前が無いパックでは名前を使わずに書く）。
 */
function questionBandText(characterName: string | undefined): string {
  const subject = characterName === undefined ? "" : `${characterName} が`
  return `↑ ${subject}質問しています。上の選択肢から選ぶか、ここに書いて答えてください`
}

/**
 * 入力欄のプレースホルダ。**依頼先はキャラクター**（「claude」は素の呼び方で目的と食い違う）
 * なので、`character.name` から組み立てる。キャラクターがまだ届いていない・名前が無いときは、
 * 名前を使わずに依頼を書く操作だけを伝える（`"claude"` へ戻さない。原則4「キャラクターの中身を
 * コードに書かない」）。
 */
function composerPlaceholder(characterName: string | undefined): string {
  const subject = characterName === undefined ? "" : `${characterName} への`
  return `${subject}依頼を書く`
}

/** IME の変換確定中か。`isComposing` に加え、対応していない古いブラウザ向けに `keyCode` も見る。 */
function isComposingEvent(event: ComposerKey): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}
