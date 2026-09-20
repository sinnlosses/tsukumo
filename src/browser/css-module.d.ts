// `*.module.css`（CSS Modules）を import したときに受け取るもの。**CSS に書いた class 名 →
// 実際に DOM へ付く名前**の対応表で、中身は `bun build` がファイルごとにハッシュ化して作る
// （docs/design.md 6.6）。
//
// 引くときの綴りは**CSS に書いたそのまま**（`styles["balloon-track"]`）。キャメルケースへの
// 変換は挟まない（用語集の語をそのまま class 名にしておくため。`docs/glossary.md`）。

declare module "*.module.css" {
  const classNames: Readonly<Record<string, string>>
  export default classNames
}
