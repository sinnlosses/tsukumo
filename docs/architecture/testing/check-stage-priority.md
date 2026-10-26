# テスト: check の段の優先度

ステータス: **正典**。入口は `docs/architecture/testing.md`（テストの全体）。

責務: `pnpm run check` の段の子を効率コアへ寄せる方式（`taskpolicy -c utility`）と、その選んだ根拠の測定。
読む時: 段の子の起こし方（`scripts/dev/lib/stage-priority.ts`）を直すとき。
直す時: 方式か測定を変えたとき。

## テスト

### check の段の優先度

- **`pnpm run check` の段の子は、`taskpolicy` があれば `taskpolicy -c utility` で起こし、検証を効率コアへ寄せて
  性能コアを手元の操作に空ける**（`scripts/dev/lib/stage-priority.ts`。clamp も `nice` も段の子孫に受け継がれる）。
  掛けるのは軽い段と単体で、**E2E の段だけは clamp の外の `nice` で起こす**（clamp を掛けた回では
  `conversation-tier` の狭い画面のボトムシートの場面が4回中2回、活動の行が届く前に撮られて落ちたため）。
  `taskpolicy` が無い環境（macOS 以外・`PATH` に無い）では全段を `nice` で起こし、検証は止めない。
  `nice` は同じ QoS の中の順番を下げるだけで、性能コアを取り合う。
  測定（2026-10-17、Apple M4・性能コア 4・効率コア 6、ほかのセッションの負荷あり。`--full` 相当を各2回）:

  | 方式         | 経過（`tw verify`） | E2E の落ち | 手元の固定の CPU 仕事（中央値。検証なしで 3.2s） |
  | ------------ | ------------------- | ---------- | ------------------------------------------------ |
  | `nice`       | 242s・169s          | 0・0       | 9.1s・5.0s                                       |
  | `utility`    | 258s・172s          | 1・0       | 4.0s・3.2s                                       |
  | `background` | 346s・291s          | 0・1       | 3.8s・3.6s                                       |

  `background` は `utility` と手元の空きが同じで経過が長いので、`utility` を選んだ。
  E2E の段だけを外に出したいまの形は、E2E 全件の回数の上限に当たって測れていない
