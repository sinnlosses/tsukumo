# 未対応の指示メモ（ここに書くと次のセッションが `/plan-tasks` でタスク化する。正典: `docs/workflow.md`）

- （T-069 の結論から。2026-09-12）Idiomorph 0.8.0 を `vendor/` に同梱し、`subscriptionScript` の
  `el.innerHTML = event.data` を morph に置き換える。取得元は jsdelivr（cdnjs には無い）、
  ライセンス 0BSD、min+gzip 3.7KB。`vendor/README.md` の表も足す。**T-070 はこれで直るので、
  T-070 の本文を「Idiomorph で直す」に差し替えるか、この作業に統合する**
- （T-069 の結論から。2026-09-12）ブラウザ側 JS 812行を `src/view.ts` のテンプレート文字列から
  独立した `.ts` ファイルへ出し、`bun build` でバンドルして配る。`tsc` と `oxlint` が届く状態に
  する。**`bun run start` と `bin/tsukumo`（`bun link` 済み）が壊れない形**を先に決める
  （ビルド成果物が無くても起動できるようにするか、起動時にビルドするか）
- （T-069 の結論から。2026-09-12）CSS の `STYLE` 定数（約700行）を複数の `.css` に割り、
  上のビルド工程に相乗りしてまとめる。割り方は領域の単位（レイアウト／メインビュー／キャラビュー／
  サイドバー／入力欄／レポートの見た目）を目安にする
