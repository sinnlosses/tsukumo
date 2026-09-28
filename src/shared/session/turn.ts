// 時系列の記録を利用者の依頼（`request`）を境目にターンの並びへ割る。
// 割り方を持つのはここだけで、読む側はこの並びの上で自分の形に変える。
//
// 型引数で受けるのは、確定した記録（`SessionRecord`）だけでなく、書きかけの本文を末尾に足した表示の形（`MainViewEntry`）も割るため。
// どちらも依頼は `kind: "request"` で、そのターンの通し番号（`turnId`）を持つ。

/**
 * 依頼で始まっていないまとまり（{@link Turn} の `pre-request`）に振る番号。実在のターンの
 * 番号（0以上）とぶつからない値にする。
 */
export const PRE_REQUEST_TURN_ID = -1

/** 割れる記録の形。依頼は `kind: "request"` で、`turnId` を持つ（{@link TurnRequest}）。 */
type TurnItem = { readonly kind: string }

/** 記録のうち、ターンの頭になる依頼。 */
export type TurnRequest<T extends TurnItem> = Extract<
  T,
  { readonly kind: "request"; readonly turnId: number }
>

/** 記録のうち、依頼でないもの（ターンの中身）。 */
export type TurnRest<T extends TurnItem> = Exclude<T, { readonly kind: "request" }>

/**
 * 依頼1件と、その後ろ（次の依頼の手前まで）の記録。
 * 依頼より前に届いた記録は、依頼を持たない `pre-request` にまとめる（セッションの途中から追い始めたときや、依頼より先に本文・セリフが届いたときに起こる）。
 */
export type Turn<T extends TurnItem> =
  | {
      readonly kind: "request"
      readonly request: TurnRequest<T>
      readonly records: readonly TurnRest<T>[]
    }
  | { readonly kind: "pre-request"; readonly records: readonly TurnRest<T>[] }

/**
 * 記録を依頼の区切りでターンに割る（古い→新しいの順）。
 *
 * - `pre-request` は先頭にしか来ず、依頼より前の記録が1件も無ければ置かない（空のまとまりを作らない）。
 *   依頼が1件も無ければ、記録は全部 `pre-request` に入る
 * - 依頼で始まるターンは、後ろに記録が無くても置く（`records` が空）
 */
export function splitIntoTurns<T extends TurnItem>(records: readonly T[]): readonly Turn<T>[] {
  const requests = records.flatMap((record, index) =>
    isRequest(record) ? [{ request: record, index }] : [],
  )
  const firstRequestIndex = requests[0]?.index ?? records.length
  const preRequest: readonly Turn<T>[] =
    firstRequestIndex === 0
      ? []
      : [{ kind: "pre-request", records: records.slice(0, firstRequestIndex).filter(isRest) }]

  return [
    ...preRequest,
    ...requests.map(({ request, index }, position): Turn<T> => ({
      kind: "request",
      request,
      records: records
        .slice(index + 1, requests[position + 1]?.index ?? records.length)
        .filter(isRest),
    })),
  ]
}

/**
 * ターンの通し番号。
 * 依頼で始まるターンは依頼が持つ番号をそのまま使い（`SessionState.nextTurnId` が振ったもの。窓から古い記録が落ちてもずれない）、`pre-request` は {@link PRE_REQUEST_TURN_ID}。
 */
export function turnIdOf<T extends TurnItem>(turn: Turn<T>): number {
  return turn.kind === "pre-request" ? PRE_REQUEST_TURN_ID : turn.request.turnId
}

function isRequest<T extends TurnItem>(record: T): record is TurnRequest<T> {
  return record.kind === "request"
}

function isRest<T extends TurnItem>(record: T): record is TurnRest<T> {
  return !isRequest(record)
}
