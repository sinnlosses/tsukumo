# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

- ブラウザ側の自作 store を zustand に置き換える（2026-09-26）。対象は `useSyncExternalStore` で
  書いている `src/browser/stores/` の各 store と、`domain/reveal/brush-tip.ts`・
  `components/page/achievement/hooks/use-diary-book-open-request.ts`。`subscribe` / `getSnapshot` /
  listeners の定型と Context の Provider を消すのが狙い。`docs/research/architecture-rethink.md`
  の状態管理の行で「配り方が面倒になったら zustand」と控えにしていたものを本採用にする。
  - まず小さい1つ（`question-scroll.tsx` か `turn-selection.tsx`）を置き換えて形を決めてから残りへ広げる
  - セレクタが毎回新しいオブジェクトを返すと描き直しが止まらない罠は zustand でも残るので、
    `useShallow` の使いどころを規約（`docs/coding-standards.md`「React」節）に書く
  - `docs/architecture.md` の状態管理の記述と `docs/design.md` 6.2 を追随させる

## エージェントのドラフト
