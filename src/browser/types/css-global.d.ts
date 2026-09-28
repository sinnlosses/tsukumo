// グローバルな CSS（`theme.css`）を副作用だけで import したときの宣言。
// 受け取る値は無いので中身は空で、`vite build` が束ねるための import を TypeScript に通すためだけにある。
//
// TypeScript 7 から型宣言の無い副作用 import が TS2882 で落ちるようになったので要る。
// `*.css` と広く書かない。型宣言を生成し忘れた `*.module.css` の import まで黙って通り、class 名の綴りの検査が効かなくなるため。
declare module "*/styles/theme.css" {}
