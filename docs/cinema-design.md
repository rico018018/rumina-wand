# 映画調の固定視点 — 2026-10-27

実写版ハリーポッターを参照する方向で、新規生成した写実調の石造ホール背景を導入。
背景は静止画、敵と呪文対象・魔法はリアルタイム3Dを維持する構成。映画そのものの映像や公式モデルは未使用。

- 固定視点用の尖頭アーチ、細かな彫刻、濡れた敷石、松明と月光の背景。
- 画像が読み込めた場合のみ従来の立体背景を隠す。読み込み失敗時は従来の背景で遊べる。
- 敵・小道具の接地影と、呪文に対応する床の光を重ねる。
- 人物の歩行時の上下動を抑え、照明を背景の暖色・寒色に合わせる。
- 光線の芯を細くし、輪・球状の衝撃波の不透明度を下げる。火花の粒を小さくする。発光色の設定と全14呪文の動作は維持。
- マイク・カメラのON/OFF操作は変更しない。

## 制作した背景

- ファイル: assets/cinema/hall.webp（1672×941、約0.30MB）
- 制作: 組み込みimage_gen。元PNGは作業用に保持し、配信用にWebP変換。
- プロンプト要旨: Live-action Harry Potter / Hogwarts-inspired Gothic duelling chamber, photorealistic movie set photography, 16:9, 1.8m eye height, 42° vertical field of view, empty central duelling space, carved limestone pillars, pointed windows and rib vaults, worn flagstones, amber torchlight and silvery moonlight, no people, no wands, no text or logos.

## 検証

背景の切替・読み込み失敗・破棄後の遅延読み込み・画角変更をテスト。
検証環境はWebGLが無効のため、実機で合成結果・影・明るさ・性能の確認が必要。映画と同等の人物モデルや実写と区別できない品質を達成済みとはしない。
背景は固定視点の画像なので、視点を自由に動かす機能には対応しない。縦画面では背景の左右が切れる。
