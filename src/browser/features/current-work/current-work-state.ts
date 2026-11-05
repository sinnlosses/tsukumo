/**
 * 状態の語（上ほど強い）。
 * `background` はターンは終わっているがバックグラウンドタスクが動いているとき。
 * `diary` は成果の日記書きで日記を書いているとき（`state.diaryWriting.kind === "writing"`）。
 * 会話のターンと並んで書いているので作業中より弱い（作業中が動いていれば作業中を出す）。
 */
export type CurrentWorkState = "stopped" | "pending" | "running" | "diary" | "background" | "idle"
