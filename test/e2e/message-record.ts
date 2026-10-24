// E2E が見るブラウザとの往復の記録。WebSocket で送ったコマンドと受け取ったフレーム、
// 届いた応答の URL を控え、狙ったイベントや応答が届くまで待つ口を渡す。
// 形の正典は `docs/architecture/testing.md`「E2E の成果物と再現」。

import type { Page } from "playwright-core"

/** 狙ったイベントが届くまで待つ上限（ミリ秒）。場面の長さ（20 秒まで）に余裕を持たせる。 */
export const EVENT_TIMEOUT_MS = 30_000

export type MessageRecord = {
  readonly list: () => readonly unknown[]
  readonly waitForEvent: (kind: string, occurrence?: number) => Promise<void>
  /**
   * `kind` のイベントが届くたびに（登録前に届いていたものも含め）`predicate` で確かめ、
   * 真になった最初の1件まで待つ。
   */
  readonly waitForEventMatching: (
    kind: string,
    predicate: (event: Readonly<Record<string, unknown>>) => boolean,
  ) => Promise<void>
  /** 送ったコマンドのすべてに応答が届くまで待つ。 */
  readonly waitForAnswers: () => Promise<void>
}

/**
 * WebSocket で送ったコマンドと受け取ったフレームを、届いた順に並べる
 * （`docs/architecture/testing.md`「E2E の成果物と再現」の畳み方）。
 */
export function recordMessages(page: Page): MessageRecord {
  const entries: unknown[] = []
  // 手続きの要求番号（oRPC の `i`）は送るたびに変わるので、送った順の番号に置き換える。
  const requestOrders = new Map<string, number>()
  const orderOf = (rawId: unknown): number => {
    const key = String(rawId)
    const order = requestOrders.get(key) ?? requestOrders.size + 1
    requestOrders.set(key, order)
    return order
  }
  // 種別ごとに届いた回数（同じ `kind` が場面の中で複数回流れるものを、狙った回目まで待つため）。
  const counts = new Map<string, number>()
  const waiters: {
    readonly kind: string
    readonly target: number
    readonly resolve: () => void
  }[] = []
  // 届いた生のイベント。条件で待つ口は、登録より前に届いていた分も確かめる。
  const rawEvents: { readonly kind: string; readonly event: Readonly<Record<string, unknown>> }[] =
    []
  const predicateWaiters: {
    readonly kind: string
    readonly predicate: (event: Readonly<Record<string, unknown>>) => boolean
    readonly resolve: () => void
  }[] = []

  // 押し出しの購読（`frame.subscribe`）の要求番号。購読はコマンドではないので列に載せず、
  // その Event Iterator の中身（`t: 3` の `message`）をフレームとしてほどく。
  const subscriptionIds = new Set<string>()
  const unanswered = new Set<number>()
  const answerWaiters: (() => void)[] = []

  const receive = (payload: string): void => {
    const envelope = parseRecord(payload)
    if (subscriptionIds.has(String(envelope["i"]))) {
      const message = asRecord(envelope["p"])
      if (envelope["t"] === EVENT_ITERATOR_MESSAGE && message["e"] === "message") {
        receiveFrame(asRecord(asRecord(message["d"])["json"]))
      }
      return
    }
    // 購読のほかに届くのはコマンドの手続きの応答（oRPC の封筒）。状態コードは 200 のとき省かれる。
    if ("i" in envelope) {
      const response = asRecord(envelope["p"])
      const order = orderOf(envelope["i"])
      const answer = {
        received: "response",
        order,
        status: response["s"] ?? 200,
        body: response["b"],
      }
      // 応答と、同じ操作で流れるイベントは別のフレームで、どちらが先に着くかが走らせるたびに違う。
      // 応答は送った要求の直後に置いて、着順を成果物に持ち込まない。
      const sentIndex = entries.findIndex(
        (entry) => asRecord(entry)["sent"] !== undefined && asRecord(entry)["order"] === order,
      )
      entries.splice(sentIndex === -1 ? entries.length : sentIndex + 1, 0, answer)
      unanswered.delete(order)
      if (unanswered.size === 0) {
        for (const resolve of answerWaiters.splice(0)) {
          resolve()
        }
      }
    }
  }

  const receiveFrame = (frame: Readonly<Record<string, unknown>>): void => {
    switch (frame["type"]) {
      case "hello":
        entries.push({ received: "hello", protocolVersion: frame["protocolVersion"] })
        break
      case "events": {
        const events = Array.isArray(frame["events"]) ? frame["events"] : []
        for (const stamped of events) {
          const record = asRecord(stamped)
          const event = asRecord(record["event"])
          entries.push({ received: "event", at: record["at"], event: trimEvent(event) })
          const kind = String(event["kind"])
          rawEvents.push({ kind, event })
          const nextCount = (counts.get(kind) ?? 0) + 1
          counts.set(kind, nextCount)
          for (const waiter of waiters.filter(
            (candidate) => candidate.kind === kind && nextCount >= candidate.target,
          )) {
            waiter.resolve()
          }
          for (const waiter of predicateWaiters.filter(
            (candidate) => candidate.kind === kind && candidate.predicate(event),
          )) {
            waiter.resolve()
          }
        }
        break
      }
      case "refresh":
        break
      default:
        entries.push({ received: frame["type"], frame })
    }
  }

  // 送るのは手続きの要求（`{ i, p: { u: "/<機能>/<手続き>", b: { json } } }`）。購読の要求だけは
  // 番号を覚えて列に載せない。
  const send = (payload: string): void => {
    const request = parseRecord(payload)
    const body = asRecord(asRecord(request["p"])["b"])
    const url = asRecord(request["p"])["u"]
    if (url === FRAME_SUBSCRIBE_URL) {
      subscriptionIds.add(String(request["i"]))
      return
    }
    const order = orderOf(request["i"])
    unanswered.add(order)
    entries.push({
      sent: typeof url === "string" ? url.replace(/^\//, "").replaceAll("/", ".") : request,
      order,
      input: body["json"],
    })
  }

  page.on("websocket", (socket) => {
    socket.on("framereceived", (frame) => {
      receive(String(frame.payload))
    })
    socket.on("framesent", (frame) => {
      send(String(frame.payload))
    })
  })

  return {
    list: () => [...entries],
    waitForAnswers: () => {
      if (unanswered.size === 0) {
        return Promise.resolve()
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`コマンドの応答が届かない（${String(EVENT_TIMEOUT_MS)}ms）`))
        }, EVENT_TIMEOUT_MS)
        answerWaiters.push(() => {
          clearTimeout(timer)
          resolve()
        })
      })
    },
    waitForEvent: (kind, occurrence = 1) => {
      if ((counts.get(kind) ?? 0) >= occurrence) {
        return Promise.resolve()
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `イベント ${kind} の${String(occurrence)}回目が届かない（${String(EVENT_TIMEOUT_MS)}ms）`,
            ),
          )
        }, EVENT_TIMEOUT_MS)
        waiters.push({
          kind,
          target: occurrence,
          resolve: () => {
            clearTimeout(timer)
            resolve()
          },
        })
      })
    },
    waitForEventMatching: (kind, predicate) => {
      if (rawEvents.some((candidate) => candidate.kind === kind && predicate(candidate.event))) {
        return Promise.resolve()
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `イベント ${kind} が条件を満たさないまま届かない（${String(EVENT_TIMEOUT_MS)}ms）`,
            ),
          )
        }, EVENT_TIMEOUT_MS)
        predicateWaiters.push({
          kind,
          predicate,
          resolve: () => {
            clearTimeout(timer)
            resolve()
          },
        })
      })
    },
  }
}

/** 届いた応答の URL を数える。登録より前に届いた分も数えられるよう、ページを開く前から張る。 */
export function recordResponses(page: Page): {
  readonly count: (urlPart: string) => number
  readonly waitForCount: (urlPart: string, atLeast: number) => Promise<void>
} {
  const urls: string[] = []
  const waiters: { readonly check: () => boolean; readonly resolve: () => void }[] = []
  const count = (urlPart: string): number => urls.filter((url) => url.includes(urlPart)).length
  page.on("response", (response) => {
    urls.push(response.url())
    for (const waiter of waiters.filter((candidate) => candidate.check())) {
      waiters.splice(waiters.indexOf(waiter), 1)
      waiter.resolve()
    }
  })
  return {
    count,
    waitForCount: (urlPart, atLeast) => {
      if (count(urlPart) >= atLeast) {
        return Promise.resolve()
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `応答 ${urlPart} が${String(atLeast)}件届かない（${String(EVENT_TIMEOUT_MS)}ms）`,
            ),
          )
        }, EVENT_TIMEOUT_MS)
        waiters.push({
          check: () => count(urlPart) >= atLeast,
          resolve: () => {
            clearTimeout(timer)
            resolve()
          },
        })
      })
    },
  }
}

/**
 * `session-info` の `slashCommands`・`terminalSlashCommands` と `command-descriptions` の
 * `descriptions` を固定の印に畳む。
 */
export function collapseCommandCatalog(entries: readonly unknown[]): readonly unknown[] {
  return entries.map((entry) => {
    const record = asRecord(entry)
    if (record["received"] !== "event") {
      return entry
    }
    const event = asRecord(record["event"])
    if (event["kind"] === "session-info") {
      return {
        ...record,
        event: {
          ...event,
          slashCommands: COLLAPSED_COMMAND_CATALOG,
          terminalSlashCommands: COLLAPSED_COMMAND_CATALOG,
        },
      }
    }
    if (event["kind"] === "command-descriptions") {
      return { ...record, event: { ...event, descriptions: COLLAPSED_COMMAND_CATALOG } }
    }
    return entry
  })
}

/**
 * 連なる `partial-utterance` を1件に畳む（`joinPartialUtterances` と同じ
 * 畳み方だが、束の切れ目そのもの——サーバ側の束ねと `fixture/fake-session/` の
 * `afterMs` が同じ時刻に重なると、どちらのタイマーが先に走るかで束の切れ目が走らせるたびに
 * 変わる（`docs/architecture/testing.md`「E2E の成果物と再現」）——を比べる前に消すためにここでも行う。
 * 消えるのは切れ目の位置だけで、他の種別との並びは変えない。
 */
export function collapsePartialUtterances(entries: readonly unknown[]): readonly unknown[] {
  return entries.reduce<readonly unknown[]>((collapsed, entry) => {
    const previousText = partialUtteranceText(collapsed[collapsed.length - 1])
    const currentText = partialUtteranceText(entry)
    if (previousText === undefined || currentText === undefined) {
      return [...collapsed, entry]
    }
    return [
      ...collapsed.slice(0, -1),
      {
        ...asRecord(entry),
        event: { kind: "partial-utterance", text: previousText + currentText },
      },
    ]
  }, [])
}

export function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}
}

/** 購読の手続きの経路（oRPC の要求の `u`）。 */
const FRAME_SUBSCRIBE_URL = "/frame/subscribe"

/** oRPC の封筒で、Event Iterator の1件を表す種別（`@orpc/standard-server-peer` の `MessageType`）。 */
const EVENT_ITERATOR_MESSAGE = 3

const COLLAPSED_COMMAND_CATALOG = "<コマンド一覧>"

/** `partial-utterance` の `text`。それ以外の並び（`received: "event"` でないものを含む）は `undefined`。 */
function partialUtteranceText(entry: unknown): string | undefined {
  const record = asRecord(entry)
  const event = asRecord(record["event"])
  const text = event["text"]
  return record["received"] === "event" &&
    event["kind"] === "partial-utterance" &&
    typeof text === "string"
    ? text
    : undefined
}

/**
 * `character-changed` はいまのパックの名前と表情だけを残す（同梱のパックの一覧はパックを直す
 * たびに変わり、シナリオが確かめたいことではない）。
 */
function trimEvent(event: Readonly<Record<string, unknown>>): unknown {
  if (event["kind"] === "character-changed") {
    return { kind: event["kind"], pack: event["pack"], expressions: event["expressions"] }
  }
  return event
}

function parseRecord(payload: string): Readonly<Record<string, unknown>> {
  return asRecord(JSON.parse(payload))
}
