# NOCTUNE — 別アプリ仕様（2026-07-12 オーケストラ採決）

既存 `~/violin-ear-quest`（みみクエスト）は変更しない。本リポはコピーフォーク。

## 勝ちフレーム
コピーフォーク別アプリ。シアン／ブルーブラックの大人向けUI。タイトル **NOCTUNE**。

## MUST
- localStorage キー分離: `noctune-v1`
- ハモリ setup に `startCents`（40/25/10/5）＝ステアケース初期値のみ
- playFx: correct/wrong を短く・音程感薄く再設計。newBest/select 追加
- おとあて: 正解音名を explain
- ミクロ耳: 直前と同じ基準MIDIを避ける
- タイトル／アイコン選択は設定内（初回必須ゲートにしない）
- 既存アプリのコード・データに触れない

## WONT
- テーマ切替で既存を兼用
- 共通ライブラリ抽出（今回）
- 長いメロディックSFX
- Persona公式IPの意匠・名称

## 共通化メモ（後日）
境界候補: theory / engine(Staircase) / audio voice / runner。theme・screens・sfx・copy はアプリ固有。
