import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// 質問（単数・複数・プレビュー。docs/design.md 10章「E2E のシナリオの一覧」）。疑似セッションの
// 4つの場面で、答え待ちの質問の札（`<QuestionAsk>`）の出方を確かめる: `question-pair`
// （単一選択の質問が1問ずつ届く）、`question-multi`（複数選択のチェックボックス）、
// `question-long`（長いラベルと長い説明の折り返し）、`question-preview`（選択肢ごとの比較を
// メインビューに出す）。
//
// 選ぶ・答えるところまでは自動操作しない（`docs/architecture.md`「手で確かめること」に、
// 質問の場面を Playwright で自動操作すると `turnInProgress` が解けないまま残ることがある、という
// 既知の症状がある）。ここで確かめるのは、答え待ちの札が出た時点の DOM の構造だけ。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("質問", () => {
  it("単一選択の質問が1問ずつ届く（question-pair）", async () => {
    const room = await run.open({
      scenario: "question-ask-pair",
      scene: "question-pair",
      viewport: "wide",
    })

    await room.waitForEvent("pending-changed")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("複数選択の質問はチェックボックスで出る（question-multi）", async () => {
    const room = await run.open({
      scenario: "question-ask-multi",
      scene: "question-multi",
      viewport: "wide",
    })

    await room.waitForEvent("pending-changed")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("長いラベルと長い説明の質問が重ならずに出る（question-long）", async () => {
    const room = await run.open({
      scenario: "question-ask-long",
      scene: "question-long",
      viewport: "wide",
    })

    await room.waitForEvent("pending-changed")
    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("選択肢ごとの比較（preview）がメインビューに出る（question-preview）", async () => {
    const room = await run.open({
      scenario: "question-ask-preview",
      scene: "question-preview",
      viewport: "wide",
    })

    await room.waitForEvent("pending-changed")
    // question-preview は turn-finished を流さない場面（答えないまま比較だけを見せる）ので、
    // その次に届く speech まで待ってから撮る。1回目の speech は `opening` の立ち上がりの
    // 一言（名指しの場面より先に流れる）なので、2回目（この場面自身の speech）を待つ。
    await room.waitForEvent("speech", 2)
    await room.settleAndMatch(ELAPSED_MS)
  })
})
