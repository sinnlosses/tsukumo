// 振り返り1回ぶんの書き手（`docs/design.md`「日記の受け取りと保存」）。`visit-script-writer.ts` と
// 同じ形: 材料を集め、会話とは別の使い捨ての `query()`（`src/server/diary/adapter/sdk-diary.ts`）に
// 書かせ、受け取ったものを「書けた／書けなかった」に畳む。
//
// **決して reject しない**（起こせない・中断・時間切れはどれも「書けなかった」に落ちる。常駐
// プロセスは振り返り1回の失敗で落ちない）。**書けたときの `diary-written` は窓口
// （{@link createDiaryIntake}）が流す**——ここは、それが流れなかったときだけ `diary-failed` を
// 流す（二重に流さない）。
//
// 材料も日記も会話の内容に当たる。メモリにだけ持ち、ログにもファイルにも書かない
// （docs/coding-standards.md「会話内容の扱い」）。

import { type ExpressionChoice } from "../../../shared/expression-choice.ts"
import { type SessionEvent } from "../../../shared/session-event.ts"
import {
  createDiaryIntake,
  type DiaryDayTask,
  type DiaryIntake,
  type SaveDiaryParagraph,
} from "./diary-tool.ts"

/** 120 秒で諦める（仮。`docs/design.md`「日記の受け取りと保存」「問い合わせの起こし方」）。 */
const DIARY_WRITE_TIMEOUT_MS = 120_000

/** 日記を書く役目の短い指示（人格のあとに続ける）。 */
const DIARY_WRITER_INSTRUCTION =
  "あなたはいま、成果の振り返りの日記を書く役目だけを持つ。diary ツールを1回呼んだら終わり。ほかの文は書かない。"

/** 振り返り1回ぶんの材料（`session-manager` が数え直した結果から組む）。 */
export type DiaryWriteRequest = {
  readonly date: string
  readonly doneTasks: readonly DiaryDayTask[]
  /** 依頼文（`src/shared/achievement.ts` の `achievementReflectionRequestText`）。 */
  readonly requestText: string
  /** 会話のいまのモデル（`SessionState.model`。分からなければ呼び出し側が既定へ畳む）。 */
  readonly model: string
}

/**
 * 書く時点のパックと環境（`docs/design.md`「日記の受け取りと保存」「問い合わせの起こし方」）。
 * **呼ぶたびに読み直す**——キャラクターを切り替えたあとの振り返りは、切り替えたあとのパックで
 * 書く。
 */
export type DiaryWriterContext = {
  /** 人格（`persona.md` の全文。雑談で覚えたことの節も含む）。無ければ空文字列。 */
  readonly persona: string
  readonly expressions: readonly ExpressionChoice[]
  /** 書いたときのパック（ディレクトリ名と表示名）。 */
  readonly writer: { readonly pack: string; readonly name: string }
  /** claude の作業先（会話と同じ）。 */
  readonly cwd: string
  /** 子プロセスへ引き継ぐ環境変数（会話と同じ）。 */
  readonly env: Readonly<Record<string, string | undefined>>
}

/** 書き手。1回の振り返りを進め、イベントを流す。`signal` が中断されたら待たずに諦める。 */
export type DiaryWriter = (
  request: DiaryWriteRequest,
  onEvent: (event: SessionEvent) => void,
  signal: AbortSignal,
) => Promise<void>

/**
 * 書き手の出どころ。
 *
 * - `dont-write`: 起こさない（疑似セッション。claude を起こさない）
 * - `write`: その場で書かせる
 */
export type DiaryWriterSource =
  | { readonly kind: "dont-write" }
  | { readonly kind: "write"; readonly write: DiaryWriter }

/** {@link DiaryWriter} に外の世界から渡すもの（配線は `src/session-start.ts`）。 */
export type DiaryWriterPorts = {
  /** 書いた時刻（エポックミリ秒）。 */
  readonly now: () => number
  /** 1段落を保存する口（`src/server/diary/adapter/diary.ts` の `appendDiaryParagraph`）。 */
  readonly save: SaveDiaryParagraph
  /**
   * 書く時点のパックと環境。**まだ1回もパックが決まっていなければ undefined**（起こったことが
   * 無い想定だが、念のため「書けなかった」に畳む）。
   */
  readonly readContext: () => DiaryWriterContext | undefined
  /** 使い捨ての `query()`（`src/server/diary/adapter/sdk-diary.ts` の `queryDiary`）。 */
  readonly query: (
    request: {
      readonly systemPrompt: string
      readonly prompt: string
      readonly model: string
      readonly cwd: string
      readonly env: Readonly<Record<string, string | undefined>>
      readonly expressions: readonly ExpressionChoice[]
    },
    intake: DiaryIntake,
    onEvent: (event: SessionEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>
}

/**
 * {@link DiaryWriter} を1つ作る。**呼ぶたびに窓口（`DiaryIntake`）を1つ作る**——窓口が
 * 「いま書く日」を覚えたり忘れたりしない（`docs/design.md`「日記の受け取りと保存」
 * 「コマンドと依頼」）。
 */
export function createDiaryWriter(ports: DiaryWriterPorts): DiaryWriter {
  return async (request, onEvent, callerSignal) => {
    const context = ports.readContext()
    if (context === undefined) {
      onEvent({ kind: "diary-failed", date: request.date })
      return
    }

    const timeoutSignal = AbortSignal.timeout(DIARY_WRITE_TIMEOUT_MS)
    const signal = AbortSignal.any([callerSignal, timeoutSignal])

    let written = false
    const intake = createDiaryIntake(
      { date: request.date, doneTasks: request.doneTasks },
      context.writer,
      ports.now,
      ports.save,
      (event) => {
        if (event.kind === "diary-written") {
          written = true
        }
        onEvent(event)
      },
    )

    try {
      await ports.query(
        {
          systemPrompt: diarySystemPrompt(context.persona),
          prompt: request.requestText,
          model: request.model,
          cwd: context.cwd,
          env: context.env,
          expressions: context.expressions,
        },
        intake,
        onEvent,
        signal,
      )
    } catch {
      // 起こせない・中断・API の失敗。理由はどれも「書けなかった」に落ちるだけなので分けない。
    }

    if (!written) {
      onEvent({ kind: "diary-failed", date: request.date })
    }
  }
}

/**
 * `systemPrompt` を**文字列で丸ごと置き換える**（Claude Code の既定の指示文も CLAUDE.md も
 * 載らない。`docs/design.md`「日記の受け取りと保存」「問い合わせの起こし方」）。人格が空の
 * パックは、書く役目の指示だけで起こす。
 */
function diarySystemPrompt(persona: string): string {
  return [persona, DIARY_WRITER_INSTRUCTION].filter((part) => part.trim() !== "").join("\n\n")
}
