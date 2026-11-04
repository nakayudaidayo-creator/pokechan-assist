"""タイプアイコンの判定(見本との比較)と、性別マークの判定"""
import cv2, numpy as np

def feature(icon):
    """アイコンを小さくして色と形をそのまま比べられる形にする"""
    x = cv2.resize(icon, (24, 24), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    lab = cv2.cvtColor(x, cv2.COLOR_BGR2LAB)
    return lab.reshape(-1)

def is_empty(icon):
    """単タイプのときの空欄(背景の赤紫だけ)かどうか"""
    hsv = cv2.cvtColor(icon, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    bg = (((H >= 160) | (H <= 5)) & (S > 110) & (V > 60) & (V < 210)).mean()
    return bg > 0.75

def classify(icon, templates):
    """templates: {タイプ名: [特徴, ...]} → (タイプ名, 距離, 2番目との差)"""
    if is_empty(icon):
        return None, 0.0, 1.0
    f = feature(icon)
    scores = sorted((min(np.linalg.norm(f - t) for t in ts), name) for name, ts in templates.items())
    best, second = scores[0], scores[1] if len(scores) > 1 else (1e9, '')
    return best[1], best[0], second[0] - best[0]

def gender(mark):
    """♂は青、♀は赤、なしは背景のみ"""
    hsv = cv2.cvtColor(mark, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    blue = ((H >= 100) & (H <= 130) & (S > 120) & (V > 100)).mean()
    white = ((S < 70) & (V > 180)).mean()   # 記号の白い線
    if white < 0.03: return None             # 印なし(性別不明)
    return 'male' if blue > 0.10 else 'female'

