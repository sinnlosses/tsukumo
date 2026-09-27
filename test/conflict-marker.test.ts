import { describe, expect, it } from "bun:test"
import { fileURLToPath } from "node:url"

import { formatConflictMarker } from "../scripts/conflict-marker.ts"
import { collectConflictMarkers } from "../scripts/lib/repository-conflict-marker.ts"

// 手で解いた衝突の印が main に紛れ込んだままにしない。
// `merge=union` は develop/direction.md にしか効かず、手で rebase したときは印が残りうる。

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url))

describe("develop の衝突の印", () => {
  it("衝突の印は develop/ に残っていない", () => {
    expect(collectConflictMarkers(REPOSITORY_ROOT).map(formatConflictMarker)).toEqual([])
  })
})
