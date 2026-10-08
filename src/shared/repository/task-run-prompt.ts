// 「tsukumo に頼む」で送る文面。

const HELD_NOTE = "このタスクは保留なので、着手の前に判断を聞いて。"

/** 保留のタスクには、着手の前に判断を聞く旨を末尾に添える。 */
export function runPromptOf(taskId: string, held: boolean): string {
  const prompt = `タスク ${taskId} を進めて（bd show ${taskId} で読める）。`
  return held ? `${prompt}${HELD_NOTE}` : prompt
}
