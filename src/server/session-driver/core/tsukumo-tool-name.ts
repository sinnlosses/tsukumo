// tsukumo のプロセス内の MCP サーバの名前と、そのサーバが持つツールの名前。

/** プロセス内の MCP サーバの名前。モデルからは `mcp__<サーバ名>__<ツール名>` として見える。 */
export const TSUKUMO_MCP_SERVER_NAME = "tsukumo"
export const SPEAK_TOOL_NAME = "speak"
/**
 * レポートを受け取るツールの名前。載るのは仕事のときだけ。
 * 雑談では呼ばれないので、見分ける側は仕事か雑談かを問わず見ている。
 */
export const REPORT_TOOL_NAME = "report"
/** 段取りを受け取るツールの名前。載るのは仕事のときだけ。 */
export const WORK_PLAN_TOOL_NAME = "work_plan"
export const REMEMBER_TOOL_NAME = "remember"
export const FORGET_TOOL_NAME = "forget"
export const RECALL_TOOL_NAME = "recall"
export const RECALL_EPISODE_TOOL_NAME = "recall_episode"

/** tsukumo のツールのフルネーム（`mcp__tsukumo__<ツール名>`）。 */
export function tsukumoToolFullName(toolName: string): string {
  return `mcp__${TSUKUMO_MCP_SERVER_NAME}__${toolName}`
}
