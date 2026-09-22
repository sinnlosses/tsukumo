// グローバルな CSS（`styles/theme.css`）を副作用だけで import したときの宣言。**受け取る値は
// 無い**ので中身は空で、`bun build` が束ねるための import を TypeScript に通すためだけにある
// （docs/design.md 6.6）。
//
// **TypeScript 7 から必要になった**（TS2882。5.9 までは型宣言の無い副作用 import を黙って通して
// いた）。**`*.css` と広く書けない** — その綴りは `css-module.d.ts` の `*.module.css` と
// どちらが当たるか決まらず、CSS Modules の対応表の型が消えるため。
declare module "*/styles/theme.css" {}
