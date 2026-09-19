# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `task-workflow` の `WORKFLOW.md`）

## ユーザーから

## エージェントのドラフト

- TanStack Query（`@tanstack/react-query` v5）を `src/ui/` に入れ、`src/ui/features/character-view/portrait.tsx`
  の `useSvgMarkup`（`useState` + `useEffect` + `cancelled` フラグの29行）を `useQuery` に置き換える。
  `/character/<file>` は `src/adapter/server.ts` が `cache-control: no-store` で配っているので、表情を
  戻すたびに同じ SVG を取り直している。`queryKey: [url]` のキャッシュでこの往復が消え、`useEffect` も1つ減る
  （`docs/coding-standards.md`「React」節）。`QueryClientProvider` は `src/ui/main.tsx` に1枚足す
  （T-193 の調査で採用と判断。2026-09-20）
- T-188（`@` のファイル補完）の本文を更新する案: 候補一覧の GET を TanStack Query で取る形に決め、
  論点「一覧の取り直し（毎回取る／起動時に1回／時間で古くする）」は `staleTime` の値を決める話に置き換える。
  打鍵ごとの再取得の重複排除も `useQuery` が持つので、`composer.tsx` 側に取得の配線を書かずに済む
  （上の Query 導入が先に入っている前提。新しいタスクは立てない）
