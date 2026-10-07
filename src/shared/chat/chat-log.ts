// 雑談モードの会話のログ。セッションの記録から導くだけで、状態は持たない。
// 素直な時系列で、利用者の発言とキャラクターのセリフが交互に並ぶ。

import type { Expression } from "../character-pack/expression.ts"
import type { RecordedPromptImage } from "../session-driver/prompt-image.ts"
import { type RecordTime, recordTimeAt, type SessionRecord } from "../session/session-state.ts"

/**
 * 会話のログ1件。話したのがどちらかと文面、話した時刻を持つ。
 * `expression` はキャラクターの側にだけ付く（話者の印に使う）。
 * 利用者の側は代わりに、添えた画像の控え（`images`。添えていなければ空）を持つ。
 */
export type ChatLogEntry =
  | {
      readonly speaker: "user"
      readonly text: string
      readonly images: readonly RecordedPromptImage[]
      readonly time: RecordTime
    }
  | {
      readonly speaker: "character"
      readonly text: string
      readonly expression: Expression
      readonly time: RecordTime
    }
  /** 圧縮の区切り。中身を持たない（出すのは細い線1本だけで、文言は添えない）。 */
  | { readonly speaker: "boundary" }

/**
 * 記録から雑談のログを組む（古い→新しいの順）。
 * 拾うのは利用者の依頼（`request`）とセリフ（`speech`）、そして圧縮の区切り（`compact-boundary`）の3種類だけで、本文（`detail`）とツールは落とす。
 *
 * 落としたぶんを「省略した」と見せない。
 * 雑談中に本文が出るのは規約が守られなかったときだけで、画面にその事実を出しても利用者にできることが無い。
 */
export function chatLogEntries(records: readonly SessionRecord[]): readonly ChatLogEntry[] {
  return records.flatMap((record): readonly ChatLogEntry[] => {
    if (record.kind === "request") {
      return [{ speaker: "user", text: record.text, images: record.images, time: record.time }]
    }
    if (record.kind === "speech") {
      return [
        {
          speaker: "character",
          text: record.text,
          expression: record.expression,
          time: record.time,
        },
      ]
    }
    if (record.kind === "compact-boundary") {
      return [{ speaker: "boundary" }]
    }
    return []
  })
}

/**
 * ログに並べる1行。発言（{@link ChatLogEntry}）と、日の区切りの2種類。
 *
 * 発言の行が持つ `index` は {@link chatLogEntries} の並びでの位置（押して遡る行を指すのに使う。日の区切りが間に入っても番号はずれない）。
 * 日の区切りの `date` は、その下に続く発言の日。
 */
export type ChatLogRow =
  | { readonly kind: "entry"; readonly index: number; readonly entry: ChatLogEntry }
  | { readonly kind: "day"; readonly date: Temporal.PlainDate }

/**
 * ログの並びに日の区切りを差し込む。区切りが入るのは、日が変わった発言の手前だけで、並びの先頭には入れない。
 *
 * - 日を比べる相手は1つ前の発言。圧縮の区切り（`boundary`）は時刻を持たないので飛ばす
 * - 時刻の分からない発言（`restored`。前のセッションを組み直したもの）は日を持たない。
 *   そこから時刻の分かる発言へ移るところは「日が変わった」として区切る（組み直したぶんといまのぶんが同じ日に見えないように）
 * - 時刻の分からない発言そのものの手前には入れない
 *   （起こし直すと記録は空から始まり、組み直したぶんは必ず先頭に固まっているので、時刻の分かる発言のあとに来ることは無い）
 *
 * `timeZone` は日の境目を決めるタイムゾーン（IANA の名前）。ここでは読まず、呼び出し側が OS の設定を読んで渡す。
 */
export function chatLogRows(
  entries: readonly ChatLogEntry[],
  timeZone: string,
): readonly ChatLogRow[] {
  return entries.reduce<RowsInProgress>(
    (progress, entry, index) => {
      const row: ChatLogRow = { kind: "entry", index, entry }
      if (entry.speaker === "boundary") {
        return { rows: [...progress.rows, row], previous: progress.previous }
      }
      const day = entryDay(entry.time, timeZone)
      const divider: readonly ChatLogRow[] =
        day.kind === "date" && startsNewDay(progress.previous, day.date)
          ? [{ kind: "day", date: day.date }]
          : []
      return { rows: [...progress.rows, ...divider, row], previous: day }
    },
    { rows: [], previous: { kind: "none" } },
  ).rows
}

/**
 * 発言が属する日。先頭（まだ発言が無い）・時刻の分からない発言・日付の3つで、先頭では
 * 区切らず、時刻の分からない発言からは区切る（{@link chatLogRows}）。
 */
type EntryDay =
  | { readonly kind: "none" }
  | { readonly kind: "restored" }
  | { readonly kind: "date"; readonly date: Temporal.PlainDate }

/** {@link chatLogRows} の途中の姿（積んだ行と、1つ前の発言の日）。 */
type RowsInProgress = {
  readonly rows: readonly ChatLogRow[]
  readonly previous: EntryDay
}

function entryDay(time: RecordTime, timeZone: string): EntryDay {
  const at = recordTimeAt(time)
  if (at === undefined) {
    return { kind: "restored" }
  }
  return {
    kind: "date",
    date: Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(timeZone).toPlainDate(),
  }
}

/** 1つ前の発言の日から見て、`date` の発言の手前で区切るか。 */
function startsNewDay(previous: EntryDay, date: Temporal.PlainDate): boolean {
  switch (previous.kind) {
    case "none":
      return false
    case "restored":
      return true
    case "date":
      return !previous.date.equals(date)
  }
}
