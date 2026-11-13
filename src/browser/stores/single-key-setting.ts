// 紙の1字のキー（`d`・`o`・`?`）を効かせるかの印。端末ごとの好みで、既定は入。
// `[ ] { }`・数字・Enter は、この印に関わらず効く。

import { z } from "zod"

import { localPreference } from "../utils/local-preference.ts"

const singleKeyPreference = localPreference("tsukumo-single-key:v1", z.boolean(), true)

export function loadSingleKeys(): boolean {
  return singleKeyPreference.load()
}

export function saveSingleKeys(on: boolean): void {
  singleKeyPreference.save(on)
}
