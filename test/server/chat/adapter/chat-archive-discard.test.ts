import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { discardChatArchive } from "../../../../src/server/chat/adapter/chat-archive.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("chat-archive")

/** 書き込み先の親（本物の `~/.tsukumo/chat-archive` の代わり）。 */
function root(): string {
  return join(dir(), "chat-archive")
}

describe("discardChatArchive", () => {
  /** パック1つぶんの置き場に、日ごとの会話と索引と旗の3種を置く（中身は形だけ）。 */
  function writeArchiveOf(packName: string): string {
    const packDir = join(root(), packName)
    mkdirSync(packDir, { recursive: true })
    for (const fileName of ["2026-09-21.jsonl", "index.jsonl", "kept.jsonl"]) {
      writeFileSync(join(packDir, fileName), "{}\n")
    }
    return packDir
  }

  it("そのパックの置き場をディレクトリごと消し、ほかのパックの置き場は残す", () => {
    const deleted = writeArchiveOf("fictional-2")
    const other = writeArchiveOf("fictional")

    discardChatArchive(characterPackName("fictional-2"), root())

    expect(existsSync(deleted)).toBe(false)
    expect(readdirSync(other).toSorted()).toEqual(["2026-09-21.jsonl", "index.jsonl", "kept.jsonl"])
  })

  it("置き場が無くても投げない", () => {
    expect(() => discardChatArchive(characterPackName("fictional"), root())).not.toThrow()
  })
})
