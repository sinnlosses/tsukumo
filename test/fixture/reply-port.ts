// 返す層の口の代役。呼ばれたことを記録するだけで、`ask` は済んだ約束を返す。

import { vi } from "vitest"

import type { ReplyPort } from "../../src/browser/features/report/reply-port.ts"

export function idlePort(
  ask: ReplyPort["ask"] = vi.fn<ReplyPort["ask"]>(() => Promise.resolve()),
): ReplyPort {
  return {
    appendDraft: vi.fn<ReplyPort["appendDraft"]>(),
    prependDraft: vi.fn<ReplyPort["prependDraft"]>(),
    ask,
  }
}
