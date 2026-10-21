import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  appendInputLedger,
  pruneInputLedgerFiles,
  readInputLedger,
} from "../../../../src/server/session-driver/adapter/input-ledger-file.ts"
import { parseSessionId } from "../../../../src/server/session-driver/core/session-id.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("input-ledger")

const SESSION = "00000000-0000-4000-8000-0000000000aa"
const OTHER_SESSION = "00000000-0000-4000-8000-0000000000bb"
const REQUEST = "00000000-0000-4000-8000-000000000001"
const DAY_MS = 24 * 60 * 60 * 1000

function sessionId(value: string) {
  const parsed = parseSessionId(value)
  if (parsed === undefined) {
    throw new Error("テストの ID が UUID の綴りでない")
  }
  return parsed
}

describe("入力の控えのファイル", () => {
  it("書き足した控えを、同じセッションの ID で読み戻す", () => {
    appendInputLedger(
      {
        sessionId: sessionId(SESSION),
        lines: [
          { kind: "input", uuid: REQUEST, input: "aside" },
          { kind: "turn-end", uuids: [REQUEST], outcome: { kind: "interrupted" } },
        ],
      },
      dir(),
    )

    const ledger = readInputLedger(SESSION, dir())
    expect(ledger.inputKindOf(REQUEST)).toBe("aside")
    expect(ledger.turnOf(REQUEST)).toEqual({ outcome: { kind: "interrupted" } })
    expect(readInputLedger(OTHER_SESSION, dir()).inputKindOf(REQUEST)).toBeUndefined()
  })

  it("UUID の綴りでない ID はパスに組まず、何も引けない控えを返す", () => {
    expect(readInputLedger("../架空", dir()).inputKindOf(REQUEST)).toBeUndefined()
  })

  it("更新時刻が14日を過ぎた控えだけを消し、控えの名前でないファイルには触らない", () => {
    const now = 100 * DAY_MS
    mkdirSync(dir(), { recursive: true })
    const old = join(dir(), `${SESSION}.jsonl`)
    const fresh = join(dir(), `${OTHER_SESSION}.jsonl`)
    const stranger = join(dir(), "架空のファイル.jsonl")
    for (const path of [old, fresh, stranger]) {
      writeFileSync(path, "")
    }
    const oldSeconds = (now - 15 * DAY_MS) / 1000
    const freshSeconds = (now - 13 * DAY_MS) / 1000
    utimesSync(old, oldSeconds, oldSeconds)
    utimesSync(stranger, oldSeconds, oldSeconds)
    utimesSync(fresh, freshSeconds, freshSeconds)

    pruneInputLedgerFiles(now, dir())

    expect([existsSync(old), existsSync(fresh), existsSync(stranger)]).toEqual([false, true, true])
  })
})
