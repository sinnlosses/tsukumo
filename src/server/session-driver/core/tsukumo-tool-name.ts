// tsukumo のプロセス内の MCP サーバの名前と、そのサーバが持つツールの名前。

/** プロセス内の MCP サーバの名前。モデルからは `mcp__<サーバ名>__<ツール名>` として見える。 */
export const TSUKUMO_MCP_SERVER_NAME = "tsukumo"
export const SPEAK_TOOL_NAME = "speak"
/**
 * レポートを受け取るツールの名前。載るのは仕事のときだけ。
 * 雑談では呼ばれないので、見分ける側は仕事か雑談かを問わず見ている。
 */
export const REPORT_TOOL_NAME = "report"
/** ワークプランを受け取るツールの名前。載るのは仕事のときだけ。 */
export const WORK_PLAN_TOOL_NAME = "work_plan"
/** 委譲先が段の結果を返すツールの名前。載るのは仕事のときだけ。 */
export const PHASE_RESULT_TOOL_NAME = "phase_result"
/** 質問の添え書きを受け取るツールの名前。載るのは仕事のときだけ。 */
export const QUESTION_BRIEF_TOOL_NAME = "question_brief"
export const REMEMBER_TOOL_NAME = "remember"
export const FORGET_TOOL_NAME = "forget"

/** tsukumo のツールのフルネーム（`mcp__tsukumo__<ツール名>`）。 */
export function tsukumoToolFullName(toolName: string): string {
  return `mcp__${TSUKUMO_MCP_SERVER_NAME}__${toolName}`
}

/** モデルから見えるツール名が、tsukumo の MCP サーバのツールか。 */
export function isTsukumoTool(fullName: string): boolean {
  return fullName.startsWith(TOOL_NAME_PREFIX)
}

const TOOL_NAME_PREFIX = tsukumoToolFullName("")
