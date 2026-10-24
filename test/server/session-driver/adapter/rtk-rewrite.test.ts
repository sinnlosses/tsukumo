import { describe, expect, it, vi } from "vitest"

import { createRtkRewrite } from "../../../../src/server/session-driver/adapter/rtk-rewrite.ts"

describe("createRtkRewrite", () => {
  it("rtk が無ければ、何度呼んでも書き換えを頼まず元のコマンドを通す側（undefined）を返す", async () => {
    const rewrite = vi.fn<(command: string) => Promise<string | undefined>>(() =>
      Promise.resolve("rtk git status"),
    )
    const run = createRtkRewrite(() => Promise.resolve(false), rewrite)

    expect(await run("git status")).toBeUndefined()
    expect(await run("ls")).toBeUndefined()
    expect(rewrite).not.toHaveBeenCalled()
  })

  it("rtk があれば、今までどおり書き換えを頼み、有無の確かめは作ったときの1回だけ", async () => {
    const probe = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true))
    const run = createRtkRewrite(probe, (command) => Promise.resolve(`rtk ${command}`))

    expect(await run("git status")).toBe("rtk git status")
    expect(await run("ls")).toBe("rtk ls")
    expect(probe).toHaveBeenCalledTimes(1)
  })
})
