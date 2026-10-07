// `phases` を省いた `work_plan` を受け付けたときに返す結果の文と、その文から段の並びを読み戻す決まり。
// 結果の文は transcript に残るので、組み直すときは Beads を読まずにここから並びを戻す。
// 1行目のあとに `<番号>. <段の名前>` を1から順に1行ずつ並べる形を、組む側と読む側で揃える。

/** 作った並びを番号付きで並べた結果の文。 */
export function taskWorkPlanReplyOf(taskId: string, phases: readonly string[]): string {
  return [
    `${REPLY_HEAD}${taskId} の \`## やること\` から帯の段を作った（段の番号はこの並びで数える）:`,
    ...phases.map((phase, index) => `${String(index + 1)}. ${phase}`),
  ].join("\n")
}

/** {@link taskWorkPlanReplyOf} の形の文から段の並びを読む。形が違えば undefined。 */
export function phasesOfTaskWorkPlanReply(content: string): readonly string[] | undefined {
  const [head, ...lines] = content.split("\n")
  if (head === undefined || !head.startsWith(REPLY_HEAD) || lines.length === 0) {
    return undefined
  }
  const phases = lines.map((line, index) => {
    const prefix = `${String(index + 1)}. `
    return line.startsWith(prefix) ? line.slice(prefix.length) : ""
  })
  return phases.some((phase) => phase.trim() === "") ? undefined : phases
}

const REPLY_HEAD = "ok。着手したタスク "
