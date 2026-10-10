// `mermaid` の塊の構文を、同梱の mermaid で検査する。
// mermaid は `window` を要るので、`happy-dom` を被せた `worker_threads` の中で走らせ、本体の大域を汚さない。
// worker は最初の検査で起こして使い回し、本体の終了は止めない。

import { Worker } from "node:worker_threads"

import type { MermaidFault } from "../core/report-violation.ts"
import { checkReplySchema } from "./report-mermaid-message.ts"

/** 1回の検査を待つ上限（初回の mermaid の読み込みを含む）。 */
const CHECK_TIMEOUT_MS = 5000

type Running = {
  readonly worker: Worker
  readonly pending: Map<number, (faults: readonly MermaidFault[]) => void>
}

// 検査は1つずつ走らせる（mermaid はモジュールに1つの状態を持つ）。
let running: Running | undefined
let nextId = 0
let queue: Promise<unknown> = Promise.resolve()

/**
 * 図のソースを順に検査し、割れたものを返す。
 * 検査が動かない（読み込みの失敗・時間切れ・worker の異常終了）ときは空の配列を返す。
 */
export function checkMermaidSyntax(sources: readonly string[]): Promise<readonly MermaidFault[]> {
  if (sources.length === 0) {
    return Promise.resolve([])
  }
  const result = queue.then(() => checkOnce(sources))
  queue = result
  return result
}

/** worker を止める。次の検査で起こし直す。 */
async function stopMermaidChecker(): Promise<void> {
  const current = running
  running = undefined
  await current?.worker.terminate()
}

function checkOnce(sources: readonly string[]): Promise<readonly MermaidFault[]> {
  const id = nextId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      void stopMermaidChecker()
      resolve([])
    }, CHECK_TIMEOUT_MS)
    const settle = (faults: readonly MermaidFault[]): void => {
      clearTimeout(timer)
      resolve(faults)
    }
    try {
      const current = ensureWorker()
      current.pending.set(id, settle)
      current.worker.postMessage({ id, sources })
    } catch {
      settle([])
    }
  })
}

function ensureWorker(): Running {
  if (running !== undefined) {
    return running
  }
  const worker = new Worker(new URL("./report-mermaid-worker.ts", import.meta.url))
  const pending = new Map<number, (faults: readonly MermaidFault[]) => void>()
  const started = { worker, pending } satisfies Running
  worker.on("message", (message: unknown) => {
    const reply = checkReplySchema.safeParse(message)
    if (!reply.success) {
      return
    }
    pending.get(reply.data.id)?.(reply.data.ok ? reply.data.faults : [])
    pending.delete(reply.data.id)
  })
  const fail = (): void => {
    if (running === started) {
      running = undefined
    }
    for (const settle of pending.values()) {
      settle([])
    }
    pending.clear()
  }
  worker.on("error", fail)
  worker.on("exit", fail)
  // 'message' の購読を付けたあとに呼ぶ（先に呼ぶと購読が port を ref し直し、本体が終われなくなる）。
  worker.unref()
  running = started
  return started
}
