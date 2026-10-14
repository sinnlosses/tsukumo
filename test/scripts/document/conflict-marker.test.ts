import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { formatConflictMarker } from "../../../scripts/document/conflict-marker.ts"
import { collectConflictMarkers } from "../../../scripts/document/lib/repository-conflict-marker.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

// 手で解いた衝突の印が main に紛れ込んだままにしない。
// 手で rebase したときに印が残りうる。

const MARKER_TEXT = "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> other\n"

describe(".tw の衝突の印", () => {
  const tempDir = useTempDir("conflict-marker")

  it("衝突の印は .tw/ に残っていない", () => {
    expect(collectConflictMarkers(REPOSITORY_ROOT).map(formatConflictMarker)).toEqual([])
  })

  it(".tw/local/ の中は読まず、それ以外の .tw/ の中は読む", () => {
    mkdirSync(join(tempDir(), ".tw/local"), { recursive: true })
    writeFileSync(join(tempDir(), ".tw/local/task-verify.log"), MARKER_TEXT)
    expect(collectConflictMarkers(tempDir())).toEqual([])
    writeFileSync(join(tempDir(), ".tw/config.toml"), MARKER_TEXT)
    expect(collectConflictMarkers(tempDir())).not.toEqual([])
  })

  it(".tw/ が無くても落ちない", () => {
    expect(collectConflictMarkers(tempDir())).toEqual([])
  })
})
