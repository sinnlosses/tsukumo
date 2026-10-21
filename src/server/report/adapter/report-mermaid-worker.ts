// mermaid の構文検査を走らせる worker。mermaid が要る `window` はこのスレッドの大域にだけ置く。
// 受けた図のソースを順に `mermaid.parse` に掛け、割れたものの位置と字句の名前だけを返す。

import { parentPort } from "node:worker_threads"

import { Window } from "happy-dom"

import type { MermaidFault } from "../core/report-figure-fault.ts"
import { faultOfParseError } from "./report-mermaid-error.ts"
import { checkRequestSchema } from "./report-mermaid-message.ts"

async function loadMermaid() {
  const window = new Window()
  Object.assign(globalThis, { window, document: window.document })
  const { default: mermaid } = await import("mermaid")
  return mermaid
}

const mermaidReady = loadMermaid()
mermaidReady.then(
  () => parentPort?.postMessage({ ready: true }),
  () => parentPort?.postMessage({ ready: false }),
)

parentPort?.on("message", (message: unknown) => {
  const request = checkRequestSchema.safeParse(message)
  if (!request.success) {
    return
  }
  const { id, sources } = request.data
  check(sources).then(
    (faults) => parentPort?.postMessage({ id, ok: true, faults }),
    () => parentPort?.postMessage({ id, ok: false }),
  )
})

async function check(sources: readonly string[]): Promise<readonly MermaidFault[]> {
  const mermaid = await mermaidReady
  // mermaid はモジュールに1つの状態を持つので、1つずつ順に掛ける。
  return sources.reduce<Promise<readonly MermaidFault[]>>(async (previous, source, index) => {
    const faults = await previous
    try {
      await mermaid.parse(source)
      return faults
    } catch (error) {
      return [...faults, faultOfParseError(index + 1, error)]
    }
  }, Promise.resolve([]))
}
