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

/** 間より手前で止めて「まだ出ていない」と確かめる余裕、と、出るまでに許す遅れ（ms）。 */
const GAP_TOLERANCE_MS = 100

/**
 * 時計を進めて待つときの1回の幅（ms）。描かれるのを待つ各回で時計を進めるので、
 * 「まだ出ていない」と確かめる直前の待ちは、進みすぎが間の許容より十分小さくなる幅にする。
 */
const FINE_STEP_MS = 1
const CLOCK_STEP_MS = 5
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
    // 記録がページに着く・描かれる・次のタイマーが張られるのは時計の外の実時間で起きるので、
    // 時計を進める量は決め打ちにせず、見えるまで細かく進めて、進めた合計(ms)を返す。
    const revealed = async (n: number, stepMs: number): Promise<number> => {
      const progress = { advancedMs: 0 }
      await expect
        .poll(
          async () => {
            await room.page.clock.runFor(stepMs)
            progress.advancedMs += stepMs
            return bubble(n).count()
          },
          { interval: CLOCK_POLL_MS, timeout: CLOCK_POLL_TIMEOUT_MS },
        )
        .toBe(1)
      return progress.advancedMs
    }

    await revealed(1, FINE_STEP_MS)
    expect(await bubble(2).count()).toBe(0)
    expect(await bubble(3).count()).toBe(0)

    // 2件目・3件目はどちらも、直前の吹き出しから間が空くまで出ず、空いたら遅れずに出る。
    for (const n of [2, 3]) {
      await room.page.clock.runFor(GAP_MS - GAP_TOLERANCE_MS)
      expect(await bubble(n).count()).toBe(0)

      const advancedMs = await revealed(n, CLOCK_STEP_MS)
      expect(advancedMs).toBeLessThanOrEqual(2 * GAP_TOLERANCE_MS)
      expect(await bubble(n + 1).count()).toBe(0)
    }
  })
})
