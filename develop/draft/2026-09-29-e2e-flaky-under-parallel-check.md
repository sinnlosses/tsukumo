# 単体と E2E を並べた check で task-board の E2E が揺れる原因を確かめ、落ち着き待ちをイベントに寄せる（振り返り: GH-100）

- 札: 黄 揺れ（4回目）
- 根拠: GH-100 の委譲先の1回目の `task verify` で、E2E の task-board.test.ts（検索と絞り込み）の期待値比較が落ち、打ち直すと通った。GH-100 は task-board に触れていない。直前の GH-99 で check が単体と E2E を並べて走らせるようになり（maxWorkers 単体 40%・E2E 60%）、CPU の取り合いで時間に頼った待ちが外れた疑いがある。同じ GH-99 で bundle.test.ts も5秒で切れ、testTimeout を15秒に上げている
- 出し先: 仕組みで塞ぐ。task-board.test.ts（と足場の `task-room.ts`）の撮る前の待ちを見直し、時間や描画の落ち着きではなく届くイベント・DOM の条件で待つ形に直す。直せなければ、check の並べ方（GH-99）を E2E 優先の本数に戻すかを判断する
