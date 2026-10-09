import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 雑談の吹き出しの間（docs/architecture/screen-design.md「セリフは全文で現れ、吹き出しは2秒空ける」）。
// 場面 `chat-speech-gap` は、雑談に入ってからしばらく後に、3件のセリフを続けて流す。
// 組み上がったページで走るので、足止めの時刻がレンダー中に読まれて画面を開いた時刻に固定される退行を拾える。
// ブラウザの時計は凍っているので、進めた分だけ吹き出しが増えることで間を測る。

const run = useScenarioRun()

/** 画面を開いてから、セリフが届くまでに経ったことにする時間（ms）。 */
const IDLE_MS = 5000

/** 吹き出しどうしの最低の間（ms）。 */
const GAP_MS = 2000

const SPEECH_COUNT = 3

/** 時計を細かく進めて待つときの1回の幅（ms）。 */
const CLOCK_STEP_MS = 100
const CLOCK_POLL_MS = 50
const CLOCK_POLL_TIMEOUT_MS = 15_000

describe("雑談の吹き出しの間", () => {
  it("画面を開いて時間が経ったあとに続けて届いたセリフが、2秒ずつ空いて出る", async () => {
    const room = await run.open({
      scenario: "chat-speech-gap",
      scene: "chat-speech-gap",
      viewport: "wide",
      domRoots: ["main"],
    })
    const bubble = (n: number) =>
      room.page.locator('[data-speaker="character"]', {
        hasText: `架空のセリフその${String(n)}だよ。`,
      })

    await room.page.clock.runFor(IDLE_MS)
    await room.waitForEvent("speech", SPEECH_COUNT)

    // 凍らせた時計では、届いた記録の判定に使う時刻を読み直すタイマーも進めないと鳴らない。
    await room.page.clock.runFor(1)
    await bubble(1).waitFor()
    expect(await bubble(2).count()).toBe(0)
    expect(await bubble(3).count()).toBe(0)

    await room.page.clock.runFor(GAP_MS - 100)
    expect(await bubble(2).count()).toBe(0)

    await room.page.clock.runFor(100)
    await bubble(2).waitFor()
    expect(await bubble(3).count()).toBe(0)

    // 2件目が出てから次のタイマーが張られるのは描き直しのあとなので、時計を細かく進めて待つ。
    await expect
      .poll(
        async () => {
          await room.page.clock.runFor(CLOCK_STEP_MS)
          return bubble(3).count()
        },
        { interval: CLOCK_POLL_MS, timeout: CLOCK_POLL_TIMEOUT_MS },
      )
      .toBe(1)
  })
})
