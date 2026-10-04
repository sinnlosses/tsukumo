import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  readOptionalBinaryFile,
  readOptionalFile,
} from "../../../../src/server/adapter/lib/optional-file.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const dir = useTempDir("optional-file")

describe("readOptionalFile", () => {
  it("読めないファイルは undefined", () => {
    expect(readOptionalFile(join(dir(), "no-such-file.txt"))).toBeUndefined()
  })

  it("あるファイルは中身を読む", () => {
    const path = join(dir(), "content.txt")
    const content = "test content"
    writeFileSync(path, content)

    expect(readOptionalFile(path)).toBe(content)
  })
})

describe("readOptionalBinaryFile", () => {
  it("読めないファイルは undefined", () => {
    expect(readOptionalBinaryFile(join(dir(), "no-such-file.bin"))).toBeUndefined()
  })

  it("あるファイルは Buffer で読む", () => {
    const path = join(dir(), "binary.bin")
    const content = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f])
    writeFileSync(path, content)

    expect(readOptionalBinaryFile(path)).toEqual(content)
  })
})
