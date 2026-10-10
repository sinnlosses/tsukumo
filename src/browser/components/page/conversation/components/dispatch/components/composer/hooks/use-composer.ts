// `<Composer>` のロジック。
// 下書き・質問の帯を持ち、送信とキーの読み替え（補完へ回すか・送信するか）を持つ（送信の Enter と補完のキーが同じ `keydown` を共有するため）。
//
// 入力欄の規則:
// - Enter は改行、Command+Enter で送信。IME の変換確定の Command+Enter は送らない
//   （`isComposing` と、対応していない古いブラウザ向けの `keyCode === 229` の両方を見る）
// - Command+Enter と送信ボタンは背景のタスクが残っていれば脇の話になる送り方で、Command+Shift+Enter はいつも新しい依頼として送る
//   （脇の話にするかを決めるのはサーバ。`docs/architecture/display.md`「脇の話」）
// - 送信後は入力欄を空にしてフォーカスを残す
// - `/` 補完は前方一致→部分一致、Tab / Enter は確定だけ（送信しない）。選択の上下移動は
//   矢印キーに加えて Ctrl+P（前へ）/ Ctrl+N（次へ）でも行える（Meta 併用は無視）
// - `@` 補完（git 管理下のファイルのパス）は同じキー操作で、確定すると `@<パス> ` が入る
// - 入力欄の下の `/` と `@` のボタンは、キャレットの位置にその1文字を打つのと同じ
//   （補完が開くかどうかは打ったときと同じ規則で決まる。`@` は前が空白でなければ空白を挟む）

import { useEffect, useRef, useState, type RefObject } from "react"

import type { PromptRouting } from "../../../../../../../../../shared/contract/session.ts"
import { usePhoneWidth } from "../../../../../../../../hooks/use-phone-width.ts"
import {
  EMPTY_DRAFT,
  useComposerDraft,
  type Draft,
} from "../../../../../../../../stores/composer-draft.ts"
import { useInquiryAnswer } from "../../../../../../../../stores/inquiry-answer.ts"
import { useInquiryJump } from "../../../../../../../../stores/inquiry-jump.ts"
import { useSession, useTurnRunning } from "../../../../../../../../stores/session.ts"
import { isClearWithArgs } from "../../../../../domain/clear-request.ts"
import type { ComposerKey, ComposerSurface } from "../../../domain/composer-surface.ts"
import { loadComposerMode, saveComposerMode, type ComposerMode } from "../domain/composer-mode.ts"
import { useComposerFocusTiming } from "./use-composer-focus.ts"
import { usePromptImage, type PromptImageModel } from "./use-prompt-image.ts"
import {
  insertedTrigger,
  useSuggestion,
  type ActiveSuggestions,
  type CompletionTrigger,
} from "./use-suggestion.ts"

/**
 * `<textarea>` の上の帯。接続が切れているあいだ・会話が終わったあと・`/clear` に続く文を止めたあと・答え待ち（お伺い）があるあいだだけ出す（この順に先）。
 * 答えはメインビューのお伺いの札で選ぶ（質問ならここに書いて送ってもよい）。
 * `onJump` は「お伺いへ」の口で、お伺いの札の最初の選択肢へフォーカスを移す。
 */
export type ComposerBand =
  | { readonly kind: "none" }
  | { readonly kind: "inquiry"; readonly text: string; readonly onJump: () => void }
  | { readonly kind: "disconnected"; readonly text: string }
  | { readonly kind: "clear-dropped"; readonly text: string }
  | { readonly kind: "ended"; readonly text: string; readonly onRestart: () => void }

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
  /** 入力欄の名前（読み上げに伝わる。プレースホルダは名前の代わりにならない）。 */
  readonly label: string
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
  const connected = useSession((session) => session.connection === "open")
  const linkLost = useSession((session) => session.linkLost)
  const endedReason = useSession((session) => session.state.endedReason)
  // 答え待ちの質問があるあいだ、入力欄は「依頼を書く場所」ではなく選択肢以外の答えを書く場所になる。
  const inquiry = useInquiryAnswer()
  const requestInquiryJump = useInquiryJump((state) => state.requestJump)
  const phone = usePhoneWidth()
  const slashCommands = useSession((session) => session.state.slashCommands)
  const commandDescriptions = useSession((session) => session.state.commandDescriptions)
  const draft = useComposerDraft((state) => state.draft)
  const setDraft = useComposerDraft((state) => state.setDraft)
  // `/clear` の続きがあって送らなかった文。下書きがこの文のままのあいだだけ帯を出す。
  const [blockedClearText, setBlockedClearText] = useState<string | undefined>(undefined)
  const surfaceRef = useRef<ComposerSurface | null>(null)
  const [mode, setMode] = useState<ComposerMode>(loadComposerMode)
  useComposerFocusTiming(surfaceRef)

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

  const submit = (routing: PromptRouting): void => {
    if (!connected || endedReason !== undefined) {
      return
    }
    const trimmed = draft.text.trim()
    if (trimmed === "") {
      return
    }
    if (inquiry.kind === "question") {
      // 質問に答えている間は依頼として送らない（打った字はいま見ている1問の答えになる）。
      inquiry.onAnswerWithText(trimmed)
    } else if (isClearWithArgs(trimmed)) {
      setBlockedClearText(trimmed)
      return
    } else {
      dispatch.session.prompt({ text: trimmed, images: promptImage.images, routing })
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

  const composerBand = (): ComposerBand => {
    if (linkLost) {
      return { kind: "disconnected", text: DISCONNECTED_BAND_TEXT }
    }
    if (endedReason !== undefined) {
      return {
        kind: "ended",
        text: `会話が終了しました（理由: ${endedReason}）。新しく始めると、また頼めます`,
        onRestart: () => dispatch.session.startNewSession(),
      }
    }
    if (inquiry.kind !== "question" && blockedClearText === draft.text.trim()) {
      return { kind: "clear-dropped", text: CLEAR_DROPPED_BAND_TEXT }
    }
    if (inquiry.kind === "none" || phone) {
      return { kind: "none" }
    }
    return {
      kind: "inquiry",
      text: inquiryBandText(inquiry.kind, characterName),
      onJump: () => requestInquiryJump({ focus: true }),
    }
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
      inquiry.kind === "question" ? answerPlaceholder(phone) : composerPlaceholder(characterName),
    label: inquiry.kind === "question" ? ANSWER_LABEL : REQUEST_LABEL,
    band: composerBand(),
    answering: inquiry.kind === "question",
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
      if (!turnInProgress || inquiry.kind === "question") {
        submit(event.shiftKey ? "new-request" : "aside-when-background")
      }
      return true
    },
    onSubmit: (event) => {
      event.preventDefault()
      if (turnInProgress && inquiry.kind !== "question") {
        return
      }
      submit("aside-when-background")
    },
    onInsertTrigger: insertTrigger,
  }
}

const ANSWER_PLACEHOLDER = "選択肢以外の答えを書く…"
const PHONE_ANSWER_PLACEHOLDER = "答えを書くか、上で選ぶ"

function answerPlaceholder(phone: boolean): string {
  return phone ? PHONE_ANSWER_PLACEHOLDER : ANSWER_PLACEHOLDER
}

const DISCONNECTED_BAND_TEXT =
  "サーバとつながっていません。送れず、下書きは残してあります。サーバを起こし直したなら、ページを開き直してください"

const CLEAR_DROPPED_BAND_TEXT =
  "/clear のあとの文は捨てられるので、送っていません。/clear だけを送り、続きを書き直してください"

const REQUEST_LABEL = "依頼を書く"
const ANSWER_LABEL = "質問への答えを書く"

/** `<textarea>` の上の帯の文言。誰が聞いているかを名前で言い、名前が無いパックでは名前を使わずに書く。 */
function inquiryBandText(
  kind: "permission" | "question",
  characterName: string | undefined,
): string {
  const subject = characterName === undefined ? "" : `${characterName} が`
  return kind === "question"
    ? `↑ ${subject}質問しています。上の選択肢から選ぶか、ここに書いて答えてください`
    : `↑ ${subject}実行の許可を待っています`
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
