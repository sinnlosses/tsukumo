import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

const WIRING_DIR = `${SRC_ROOT}/wiring`
const CONTEXT_FILE = "wiring-context.ts"

describe("WiringContext の欄", () => {
  it("どの欄も、2つ以上の src/wiring/*.ts が読む", () => {
    const fields = contextFields()
    const files = listSourceFiles(WIRING_DIR)
      .filter((name) => name !== CONTEXT_FILE)
      .map((name) => readFileSync(`${WIRING_DIR}/${name}`, "utf8"))

    const offenders = fields.flatMap((field) => {
      const readers = files.filter((content) => readsField(content, field)).length
      return readers >= 2 ? [] : [`${field}: 読む組み立てが ${readers} つ`]
    })

    expect(fields.length).toBeGreaterThan(0)
    expect(offenders.join("\n")).toBe("")
  })

  it('欄の読み取りの判定は、context.<欄>・WiringContext["<欄>"]・分割代入を拾い、別の語は拾わない', () => {
    expect(readsField("context.cwd", "cwd")).toBe(true)
    expect(readsField('Pick<WiringContext, "x"> & WiringContext["driver"]', "driver")).toBe(true)
    expect(readsField("const { driver, cwd } = context", "cwd")).toBe(true)
    expect(readsField("context.cwdOther", "cwd")).toBe(false)
    expect(readsField("const { driver } = options", "driver")).toBe(false)
  })
})

function contextFields(): readonly string[] {
  const content = readFileSync(`${WIRING_DIR}/${CONTEXT_FILE}`, "utf8")
  const body = content.slice(content.indexOf("export type WiringContext"))
  return [...body.matchAll(/^\s+readonly (\w+):/gm)].flatMap((matched) =>
    matched[1] === undefined ? [] : [matched[1]],
  )
}

function readsField(content: string, field: string): boolean {
  return (
    new RegExp(`\\bcontext\\.${field}\\b`).test(content) ||
    new RegExp(`WiringContext\\["${field}"\\]`).test(content) ||
    new RegExp(`\\{[^}]*\\b${field}\\b[^}]*\\}\\s*=\\s*context\\b`).test(content)
  )
}
