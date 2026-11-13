import { describe, expect, it } from "vitest"

import {
  type WorkQuietInput,
  workQuietOf,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/work-activity.ts"
import type { TurnStep } from "../../../../../../../../src/shared/session/turn-step.ts"
import {
  NO_USUAL_DURATIONS,
  type UsualDurations,
} from "../../../../../../../../src/shared/usage/usual-duration.ts"

const STARTED_AT = 1_000_000

/** 時刻 `STARTED_AT` に始まって走っている Bash の手順。 */
const RUNNING_BASH: TurnStep = {
  toolUseId: "t1",
  name: "Bash",
  input: { command: "架空のコマンド" },
  nested: false,
  startedAt: { kind: "stamped", at: STARTED_AT },
  status: { kind: "running" },
  backgroundEnd: { kind: "foreground" },
  phase: { kind: "none" },
}

const BASH_RANGE: UsualDurations = {
  ...NO_USUAL_DURATIONS,
  waits: {
    ...NO_USUAL_DURATIONS.waits,
    bash: { kind: "measured", count: 7, medianSeconds: 240, lowSeconds: 180, highSeconds: 300 },
  },
}

/** 手順が始まってから `seconds` 秒経った時点の材料。 */
function inputAfter(seconds: number, overrides: Partial<WorkQuietInput> = {}): WorkQuietInput {
  return {
    steps: [RUNNING_BASH],
    asking: false,
    backgroundTasks: [],
    turn: { kind: "running", startedAt: STARTED_AT },
    apiTrouble: { kind: "none" },
    rateLimit: { kind: "clear" },
    usual: NO_USUAL_DURATIONS,
    records: [],
    now: STARTED_AT + seconds * 1000,
    ...overrides,
  }
}

describe("workQuietOf", () => {
  it("新しい動きが無いのが 89 秒では出さず、90 秒で待ちを出す（幅が無ければ括弧を出さない）", () => {
    expect(workQuietOf(inputAfter(89))).toEqual({ kind: "none" })
    expect(workQuietOf(inputAfter(90))).toEqual({
      kind: "waiting",
      label: "待ち",
      text: "1分30秒、新しい動きが無い。コマンドの終わりを待っている",
    })
  })

  it("幅があれば、待ちの行に「いつもは」の幅を添える", () => {
    expect(workQuietOf(inputAfter(120, { usual: BASH_RANGE }))).toMatchObject({
      kind: "waiting",
      text: "2分00秒、新しい動きが無い。コマンドの終わりを待っている（いつもは 3〜5 分）",
    })
  })

  it("幅の上端の 3 倍を超えたら動かないと言う。幅が無ければ 15 分で言う", () => {
    expect(workQuietOf(inputAfter(900, { usual: BASH_RANGE }))).toMatchObject({ kind: "waiting" })
    expect(workQuietOf(inputAfter(901, { usual: BASH_RANGE }))).toEqual({
      kind: "stalled",
      label: "動かない",
      text: "いつもの 3 倍（15 分）を超えた。止まっているかもしれない。",
    })
    expect(workQuietOf(inputAfter(901))).toEqual({
      kind: "stalled",
      label: "動かない",
      text: "15 分、新しい動きが無い。止まっているかもしれない。",
    })
  })

  it("幅が短くても、動かないと言い始めるのは 5 分を過ぎてから。そのときは「いつもの何倍」と言わない", () => {
    const short: UsualDurations = {
      ...NO_USUAL_DURATIONS,
      waits: {
        ...NO_USUAL_DURATIONS.waits,
        bash: { kind: "measured", count: 5, medianSeconds: 10, lowSeconds: 5, highSeconds: 20 },
      },
    }

    expect(workQuietOf(inputAfter(300, { usual: short })).kind).toBe("waiting")
    expect(workQuietOf(inputAfter(301, { usual: short }))).toEqual({
      kind: "stalled",
      label: "動かない",
      text: "5 分、新しい動きが無い。止まっているかもしれない。",
    })
  })

  it("API を呼び直しているあいだは、経った秒にかかわらず再試と言う", () => {
    expect(
      workQuietOf(
        inputAfter(5, {
          apiTrouble: {
            kind: "retrying",
            at: STARTED_AT,
            attempt: 2,
            maxRetries: 10,
            retryDelayMs: 8000,
            errorStatus: 529,
            error: "overloaded",
          },
        }),
      ),
    ).toEqual({
      kind: "retrying",
      label: "再試",
      text: "API が混んでいる（529）。8秒おいて呼び直す。再試行中 2/10",
    })
  })

  it("上限（429）で呼び直しているあいだは、上限ではなく再試と言う", () => {
    expect(
      workQuietOf(
        inputAfter(5, {
          apiTrouble: {
            kind: "retrying",
            at: STARTED_AT,
            attempt: 1,
            maxRetries: 10,
            retryDelayMs: 8000,
            errorStatus: 429,
            error: "rate_limit",
          },
        }),
      ),
    ).toMatchObject({ kind: "retrying", label: "再試" })
  })

  it("利用の上限では、戻る時刻を言い、自動では続けないと言う", () => {
    const quiet = workQuietOf(
      inputAfter(5, {
        rateLimit: { kind: "rejected", bucket: "five-hour", resetsAt: STARTED_AT + 3_600_000 },
      }),
    )

    expect(quiet).toMatchObject({ kind: "limited", label: "上限" })
    expect(quiet.kind === "limited" ? quiet.text : "").toMatch(
      /^利用の上限に達した。.+ に戻る。自動では続けない。$/u,
    )
  })

  it("答え待ちのあいだと、働いていないあいだは出さない", () => {
    expect(workQuietOf(inputAfter(1000, { asking: true }))).toEqual({ kind: "none" })
    expect(workQuietOf(inputAfter(1000, { turn: { kind: "idle" } }))).toEqual({ kind: "none" })
  })

  it("新しい記録が届けば、そこから数え直す", () => {
    expect(
      workQuietOf(
        inputAfter(120, {
          records: [
            {
              kind: "speech",
              text: "架空のセリフ",
              expression: "default",
              answersAside: false,
              time: { kind: "stamped", at: STARTED_AT + 60_000 },
            },
          ],
        }),
      ),
    ).toEqual({ kind: "none" })
  })
})
