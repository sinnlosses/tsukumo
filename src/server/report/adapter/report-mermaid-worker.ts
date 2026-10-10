// mermaid の構文検査を走らせる worker。mermaid が要る `window` はこのスレッドの大域にだけ置く。
// 受けた図のソースを順に `mermaid.parse` に掛け、割れたものの位置と字句の名前だけを返す。

import { parentPort } from "node:worker_threads"

import { Window } from "happy-dom"

import type { MermaidFault } from "../core/report-violation.ts"
import { checkRequestSchema } from "./report-mermaid-message.ts"

const LINE_PATTERN = /Parse error on line (\d+)/
const TOKEN_PATTERN = /got '([A-Z_]+)'/

async function loadMermaid() {
  const window = new Window()
  Object.assign(globalThis, { window, document: window.document })
  const { default: mermaid } = await import("mermaid")
  return mermaid
}

const mermaidReady = loadMermaid()

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
      return [...faults, faultOf(index + 1, error)]
    }
  }, Promise.resolve([]))
}

function faultOf(block: number, error: unknown): MermaidFault {
  const text =
    typeof error === "object" && error !== null && "str" in error && typeof error.str === "string"
      ? error.str
      : error instanceof Error
        ? error.message
        : ""
  const line = LINE_PATTERN.exec(text)?.[1]
  return line === undefined
    ? { kind: "unlocated", block }
    : { kind: "located", block, line: Number(line), token: TOKEN_PATTERN.exec(text)?.[1] ?? "" }
}
