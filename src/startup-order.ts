// 起動の順序のうち、並べ方そのものが約束になっているもの。
// 互いに依らない前提の読みは両方を起こしてから待ち、終了のハンドラはタブを開く前に登録する。

/** 互いに依らない2つの前提の読みを並べて走らせ、両方が済んでから返す。 */
export async function readStartupPrerequisites<Built, Plugin>(reads: {
  readonly readBundle: () => Promise<Built>
  readonly checkPlugin: () => Promise<Plugin>
}): Promise<{ readonly built: Built; readonly workflowPlugin: Plugin }> {
  const [built, workflowPlugin] = await Promise.all([reads.readBundle(), reads.checkPlugin()])
  return { built, workflowPlugin }
}

/** 終了のハンドラを登録してからビューを開く。開くのに時間がかかる間に終了要求を受けても閉じられる。 */
export async function openViewAfterRegisteringExit<Opened>(steps: {
  readonly registerExit: () => void
  readonly openView: () => Promise<Opened>
}): Promise<Opened> {
  steps.registerExit()
  return await steps.openView()
}
