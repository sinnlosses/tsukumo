// `<Composer>` のロジック。
// 下書き・質問の帯を持ち、送信とキーの読み替え（補完へ回すか・送信するか）を持つ（送信の Enter と補完のキーが同じ `keydown` を共有するため）。
//
// 入力欄の規則:
// - Enter は改行、Command+Enter で送信。IME の変換確定の Command+Enter は送らない
//   （`isComposing` と、対応していない古いブラウザ向けの `keyCode === 229` の両方を見る）
// - Command+Enter と送信ボタンはバックグラウンドタスクが残っていれば脇の話になる送り方で、Command+Shift+Enter はいつも新しい依頼として送る
//   （脇の話にするかを決めるのはサーバ。`docs/architecture/display.md`「補足メッセージ」）
// - 送信後は入力欄を空にしてフォーカスを残す
// - 打ちかけは入力が止まったら `localStorage` に保ち（セッションごと・直近10件）、再読み込み後に入力欄が空なら戻す。送信すると消す
// - `/` 補完は前方一致→部分一致、Tab / Enter は確定だけ（送信しない）。選択の上下移動は
//   矢印キーに加えて Ctrl+P（前へ）/ Ctrl+N（次へ）でも行える（Meta 併用は無視）
// - `@` 補完（git 管理下のファイルのパス）は同じキー操作で、確定すると `@<パス> ` が入る
// - 入力欄の下の `/` と `@` のボタンは、キャレットの位置にその1文字を打つのと同じ
//   （補完が開くかどうかは打ったときと同じ規則で決まる。`@` は前が空白でなければ空白を挟む）

import { useRef, useState, type RefObject } from "react"

import type { PromptRouting } from "../../../../../../../shared/contract/session.ts"
import { FRAME_ERROR_REASON } from "../../../../../../../shared/frame-error-reason.ts"
import type { SessionId } from "../../../../../../../shared/session/session-id.ts"
import { useDebouncedCallback } from "../../../../../../hooks/use-debounced-callback.ts"
import { usePhoneWidth } from "../../../../../../hooks/use-phone-width.ts"
import { useInquiryJump } from "../../../../../../stores/inquiry-jump.ts"
import { useReplySessionKey } from "../../../../../../stores/reply-note-list.ts"
import { useRestartRefused, useSession, useTurnRunning } from "../../../../../../stores/session.ts"
import { clearSessionDraft, saveSessionDraft } from "../../../domain/composer-draft-storage.ts"
import { isClearWithArgs } from "../../../domain/slash-clear.ts"
import "../../../stores/composer-draft-session.ts"
import { EMPTY_DRAFT, useComposerDraft, type Draft } from "../../../stores/composer-draft.ts"
import { useInquiryAnswer } from "../../../stores/inquiry-answer.ts"
import { lastTurnId, settleBatchSent, useReplyBatch } from "../../../stores/reply-batch.ts"
import { loadComposerMode, saveComposerMode, type ComposerMode } from "../domain/composer-mode.ts"
import type { ComposerKey, ComposerSurface } from "../domain/composer-surface.ts"
import { blurOnEscape, useComposerFocusTiming } from "./use-composer-focus.ts"
import { usePromptImage, type PromptImageModel } from "./use-prompt-image.ts"
import { useReplyNoteQueue, type ReplyNoteQueueModel } from "./use-reply-note-queue.ts"
import {
  insertedTrigger,
  useSuggestion,
  type ActiveSuggestions,
  type CompletionTrigger,
} from "./use-suggestion.ts"

/**
 * `<textarea>` の上の帯。接続が切れているあいだ・会話が終わったあと・`/clear` に続く文を止めたあと・答え待ち（お伺い）があるあいだだけ出す（この順に先）。
 * 答えはメインビューのお伺いのカードで選ぶ（質問ならここに書いて送ってもよい）。
 * `onJump` は「お伺いへ」の口で、お伺いのカードの最初の選択肢へフォーカスを移す。
 */
type ComposerBand =
  | { readonly kind: "none" }
  | { readonly kind: "inquiry"; readonly text: string; readonly onJump: () => void }
  | { readonly kind: "disconnected"; readonly text: string }
  | { readonly kind: "clear-dropped"; readonly text: string }
  | { readonly kind: "ended"; readonly text: string; readonly onRestart: () => void }

/**
 * `<Composer>` が画面に出す形。
 */
export type ComposerModel = {
  /** 入力欄の面（`<textarea>` かマークダウンエディタ）に渡すもの。 */
  readonly input: {
    /** 入力欄のサーフェス。確定・送信のあとにフォーカスを戻し、キャレットを置き直す。 */
    readonly surfaceRef: RefObject<ComposerSurface | null>
    readonly placeholder: string
    /** 入力欄の名前（読み上げに伝わる。プレースホルダは名前の代わりにならない）。 */
    readonly label: string
    readonly draft: Draft
    readonly onChange: (draft: Draft) => void
    /** 処理した（面の既定の振る舞いへ流さない）なら true。 */
    readonly onKeyDown: (event: ComposerKey) => boolean
  }
  readonly modeSwitch: {
    readonly mode: ComposerMode
    /** 面を `<textarea>` とマークダウンエディタの間で切り替える。下書きはそのまま引き継ぐ。 */
    readonly onToggle: () => void
  }
  readonly suggestion: {
    readonly suggestions: ActiveSuggestions
    /** 候補の中で選んでいる位置（候補の件数に収めたもの）。 */
    readonly selectedIndex: number
    readonly onSelect: (index: number) => void
  }
  /** 画像まわりは `PromptImageModel` のまま（`reset` は container の中だけで使うので外へは出さない）。 */
  readonly promptImage: Omit<PromptImageModel, "reset">
  /** `<textarea>` の上の帯（質問に答えている間だけ出る）。 */
  readonly band: ComposerBand
  /** 質問に答えている間か（枠を `--state-warn` にし、送るボタンの字を変える）。 */
  readonly answering: boolean
  readonly onSubmit: (event: { readonly preventDefault: () => void }) => void
  /** 入力欄の上の「頼みごと」の列。 */
  readonly replyNotes: ReplyNoteQueueModel
  /** `/` / `@` のボタン。キャレットの位置にその文字を打ち、入力欄へフォーカスを戻す。 */
  readonly onInsertTrigger: (trigger: CompletionTrigger) => void
  /** 道具の行の「＋ 新規」。ターンの最中は塞ぎ、理由を `title` に持たせる。 */
  readonly newSession: {
    readonly disabled: boolean
    readonly title: string
    readonly onStart: () => void
  }
}

export function useComposer(): ComposerModel {
  const dispatch = useSession((session) => session.dispatch)
  const characterName = useSession((session) => session.state.character?.name)
  const askerSubject = characterName === undefined ? "" : `${characterName} が`
  const requestSubject = characterName === undefined ? "" : `${characterName} への`
  const pendingActive = useSession((session) => session.state.pending.length > 0)
  const turnInProgress = useTurnRunning()
  const restartRefused = useRestartRefused()
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
  const typeDraft = useComposerDraft((state) => state.typeDraft)
  const replaceDraft = useComposerDraft((state) => state.replaceDraft)
  // `/clear` の続きがあって送らなかった文。下書きがこの文のままのあいだだけ帯を出す。
  const [blockedClearText, setBlockedClearText] = useState<string | undefined>(undefined)
  const replyNotes = useReplyNoteQueue()
  const replySessionKey = useReplySessionKey()
  const batchNoteIds = useReplyBatch((state) => state.noteIds)
  const dispatchAwaited = useSession((session) => session.dispatchAwaited)
  const surfaceRef = useRef<ComposerSurface | null>(null)
  const [mode, setMode] = useState<ComposerMode>(loadComposerMode)
  useComposerFocusTiming(surfaceRef)

  const sessionId = useSession((session) =>
    session.state.session.kind === "starting" ? undefined : session.state.session.sessionId,
  )
  const saveDraftLater = useDebouncedCallback((id: SessionId, stopped: Draft) => {
    saveSessionDraft(id, stopped)
  }, DRAFT_SAVE_DELAY_MS)

  const suggestion = useSuggestion({
    draft,
    pendingActive,
    slashCommands,
    commandDescriptions,
    onConfirmed: (confirmed) => {
      replaceDraft(confirmed)
      surfaceRef.current?.focus()
    },
  })
  const { reset: resetPromptImage, ...promptImage } = usePromptImage({
    focusSurface: () => {
      surfaceRef.current?.focus()
    },
  })

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
    } else if (batchNoteIds.length > 0) {
      // まとめた下書きは、受け付けられたと分かってから空にする（断られたら下書きと組を残す）。
      const previousLastTurnId = lastTurnId()
      const sendBatch = async (): Promise<void> => {
        const result = await dispatchAwaited((client) =>
          client.session.prompt({ text: trimmed, images: promptImage.images, routing }),
        )
        if (result.kind !== "ok") return
        settleBatchSent(replySessionKey, batchNoteIds, previousLastTurnId)
        clearAfterSend()
      }
      void sendBatch()
      return
    } else {
      void dispatch.session.prompt({ text: trimmed, images: promptImage.images, routing })
    }
    clearAfterSend()
  }

  const clearAfterSend = (): void => {
    replaceDraft(EMPTY_DRAFT)
    if (sessionId !== undefined) {
      saveDraftLater(sessionId, EMPTY_DRAFT)
      clearSessionDraft(sessionId)
    }
    resetPromptImage()
    suggestion.reset()
    surfaceRef.current?.focus()
  }

  const insertTrigger = (trigger: CompletionTrigger): void => {
    // ボタンを押した時点で入力欄のフォーカスは外れているが、選択の位置は残っている。
    // 打っていない間にキャレットを動かしただけでは下書きの `caret` は追いつかないので、入力欄から読めるならそちらを使う。
    replaceDraft(insertedTrigger(draft, surfaceRef.current?.caret() ?? draft.caret, trigger))
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
        onRestart: () => {
          void dispatch.session.startNewSession()
        },
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
      text: inquiryBandText(inquiry.kind, askerSubject),
      onJump: () => requestInquiryJump({ focus: true }),
    }
  }

  return {
    input: {
      surfaceRef,
      placeholder:
        inquiry.kind === "question"
          ? answerPlaceholder(phone)
          : composerPlaceholder(requestSubject),
      label: inquiry.kind === "question" ? ANSWER_LABEL : REQUEST_LABEL,
      draft,
      onChange: (changed) => {
        typeDraft(changed)
        if (sessionId !== undefined) {
          saveDraftLater(sessionId, changed)
        }
        suggestion.reset()
      },
      onKeyDown: (event) => {
        const composing = isComposingEvent(event)

        if (!composing && suggestion.onKeyDown(event)) {
          return true
        }

        if (!composing && blurOnEscape(event, surfaceRef.current)) {
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
    },
    modeSwitch: {
      mode,
      onToggle: () => {
        // 打たずに動かしたキャレットは下書きに入っていないので、いまの面から読んで次の面へ渡す。
        replaceDraft({ text: draft.text, caret: surfaceRef.current?.caret() ?? draft.caret })
        const next = mode === "plain" ? "markdown" : "plain"
        setMode(next)
        saveComposerMode(next)
      },
    },
    suggestion: {
      suggestions: suggestion.suggestions,
      selectedIndex: suggestion.selectedIndex,
      onSelect: suggestion.onSelect,
    },
    promptImage,
    band: composerBand(),
    answering: inquiry.kind === "question",
    onSubmit: (event) => {
      event.preventDefault()
      if (turnInProgress && inquiry.kind !== "question") {
        return
      }
      submit("aside-when-background")
    },
    replyNotes,
    onInsertTrigger: insertTrigger,
    newSession: {
      disabled: restartRefused,
      title: restartRefused ? FRAME_ERROR_REASON.sessionSwitchDuringTurn : NEW_SESSION_LABEL,
      onStart: () => {
        void dispatch.session.startNewSession()
      },
    },
  }
}

const DRAFT_SAVE_DELAY_MS = 1000

export const NEW_SESSION_LABEL = "新しいセッションを始める"

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
function inquiryBandText(kind: "permission" | "question", subject: string): string {
  return kind === "question"
    ? `↓ ${subject}質問しています。下の選択肢から選ぶか、ここに書いて答えてください`
    : `↓ ${subject}実行の許可を待っています`
}

/**
 * 入力欄のプレースホルダ。依頼先はキャラクターなので、`character.name` から組み立てる。
 * キャラクターがまだ届いていない・名前が無いときは、名前を使わずに依頼を書く操作だけを伝える（`"claude"` へ戻さない）。
 */
function composerPlaceholder(subject: string): string {
  return `${subject}依頼を書く`
}

/** IME の変換確定中か。`isComposing` に加え、対応していない古いブラウザ向けに `keyCode` も見る。 */
function isComposingEvent(event: ComposerKey): boolean {
  return event.isComposing || event.keyCode === 229
}
