// 紙面の物差しが図に数える要素の選択子。子の class（`report-timeline-axis_` など）には当てず、根だけに当てる。
export const FIGURE_SELECTOR = [
  "pre.mermaid",
  ".chart-block",
  '[class*="report-svg-figure_"]',
  '[class*="report-image-zoom_"]',
  '[class*="report-image-missing_"]',
  '[class*="report-timeline_"]',
  '[class*="report-card-chain_"]',
].join(", ")
