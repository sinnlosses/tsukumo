import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { writeInstanceLocation } from "../../../../src/server/view-server/adapter/instance-location-file.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const home = useTempDir("instance-location")

const location = {
  pid: 4242,
  port: 7330,
  url: "http://127.0.0.1:7330/?t=架空のトークン",
  cwd: "/架空/作業場",
}

describe("writeInstanceLocation", () => {
  it("pid の名前のファイルに所在を利用者だけが読める権限で書き、返した関数で消す", () => {
    const dir = join(home(), "instance-location")
    const failures: unknown[] = []
    const remove = writeInstanceLocation({
      dir,
      location,
      reportFailure: (error) => failures.push(error),
    })
    const path = join(dir, "4242.json")

    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(location)
    expect(statSync(path).mode & 0o777).toBe(0o600)

    remove()
    expect(existsSync(path)).toBe(false)
    expect(failures).toEqual([])
  })

  it("書けなかった失敗は投げずに渡し、消す関数も落ちない", () => {
    const blocker = join(home(), "blocker")
    writeFileSync(blocker, "")
    const failures: unknown[] = []
    const remove = writeInstanceLocation({
      dir: join(blocker, "instance-location"),
      location,
      reportFailure: (error) => failures.push(error),
    })

    expect(failures).toHaveLength(1)
    expect(() => {
      remove()
    }).not.toThrow()
    expect(failures).toHaveLength(2)
  })
})
