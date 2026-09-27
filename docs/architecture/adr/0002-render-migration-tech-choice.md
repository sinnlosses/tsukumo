# 描く層の移行で決めた技術選択（2026-09-13〜17）

上の移行と同じ検討の中で決め、いまも効いている個別の技術選択（**蒸し返さない**。理由は
`docs/research/architecture-rethink.md`）:

- UI は **React 19**。Preact は alias で差し替えられる位置に置く（`vite.config.ts` の `resolve.alias`）
- 通信は **WebSocket 1本**（`ws` パッケージ）
- Markdown は **react-markdown + remark-gfm + rehype-raw + rehype-sanitize + rehype-highlight**
- 立ち絵は**動くが話さない**（表情の遷移・まばたき・登場と退場の演出。音声・口パクは持たない）
- 端末ペイン（PTY）は持たない。**設計上の余地も残さない**（2026-09-13。用途が無いことを確認した）
- **TypeScript は本質的な選択**（2026-09-13 のユーザーの問い「既存だからではなく
  本質的な最善手か」への答え）。Agent SDK の公式実装は TypeScript と Python だけで、表示はどの箱でも
  ブラウザの JS なので、**両端を1言語で通せるのは TypeScript だけ**（reducer と zod を両側で共有する
  この設計は、それが無いと成立しない）。ランタイムは2026-09-17に「いま寄せ替えない」と一度決めたが、
  **2026-09-26 に Node 26 + Vite + Vitest へ移すと決め直した**。理由は `bun test` の罠（`mock.module`
  の漏れ・`--isolate` が返らない）を消すこと、HMR で状態を保ったまま差し替えること、Vite 前提の道具を
  本物の組み立てのまま使えることの3つ。2026-09-27 に完了し、いまの実装スタックは Node + TypeScript
  （`docs/history/direction.md` の 2026-09-26「zustand・Node + Vite + Vitest への移行・Storybook・
  React Compiler」）
