// ブラウザの例外を診断ログへ送る。送れなくても諦める（再送しない）。
// 運ぶのは経路・`error.name`・スタックの先頭数フレームの行列だけで、`message` は読まない。

import {
  type BrowserErrorFrame,
  type BrowserErrorRoute,
  DIAGNOSTIC_BROWSER_ERROR_MAX_FRAMES,
  toBrowserErrorName,
} from "../../shared/diagnostic/diagnostic-record.ts"
import { rpc } from "./rpc.ts"

export function reportBrowserError(route: BrowserErrorRoute, error: unknown): void {
  rpc.diagnostic.reportBrowserError
    .call({
      route,
      errorName: toBrowserErrorName(error instanceof Error ? error.name : undefined),
      frames: stackFrames(error),
    })
    .catch(() => {})
}

/** V8 形式の `error.stack`（`    at <関数> (<file>:<line>:<column>)` / `    at <file>:<line>:<column>`）。 */
const STACK_FRAME = /^\s*at\s+(?:.*\s+\()?(.+):(\d+):(\d+)\)?\s*$/

function stackFrames(error: unknown): readonly BrowserErrorFrame[] {
  if (!(error instanceof Error) || error.stack === undefined) {
    return []
  }
  return error.stack
    .split("\n")
    .slice(1, 1 + DIAGNOSTIC_BROWSER_ERROR_MAX_FRAMES)
    .flatMap(parseStackFrame)
}

function parseStackFrame(stackLine: string): readonly BrowserErrorFrame[] {
  const matched = STACK_FRAME.exec(stackLine)
  if (matched === null) {
    return []
  }
  const [, file, line, column] = matched
  return [{ origin: originOf(file ?? ""), line: Number(line), column: Number(column) }]
}

function originOf(file: string): "bundle" | "other" {
  try {
    return new URL(file, window.location.href).origin === window.location.origin
      ? "bundle"
      : "other"
  } catch {
    return "other"
  }
}
