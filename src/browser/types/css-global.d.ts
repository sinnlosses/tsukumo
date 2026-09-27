// グローバルな CSS（`styles/theme.css`）を副作用だけで import したときの宣言。受け取る値は
// 無いので中身は空で、`vite build` が束ねるための import を TypeScript に通すためだけにある
// （docs/design.md 6.6）。
//
// TypeScript 7 から必要になった（TS2882。5.9 までは型宣言の無い副作用 import を黙って通して
// いた）。`*.css` と広く書けない — 型宣言を生成し忘れた `*.module.css` の import まで黙って通り、
// class 名の綴りの検査が効かなくなるため（型宣言の生成は docs/design.md 6.6）。
declare module "*/styles/theme.css" {}
