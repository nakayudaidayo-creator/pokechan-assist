"""ポケモンの絵の比較(色違いでも当たるよう、色ではなく形で比べる)"""
import cv2, numpy as np

def sprite_feature(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # 背景の赤紫を除いて、ポケモンの部分だけを取り出す
    H, S, V = g[..., 0], g[..., 1], g[..., 2]
    bg = (((H >= 160) | (H <= 5)) & (S > 110) & (V > 50) & (V < 210))
    fg = (~bg).astype(np.uint8)
    ys, xs = np.where(fg)
    if len(xs) == 0: return None
    crop = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)[ys.min():ys.max()+1, xs.min():xs.max()+1]
    mask = fg[ys.min():ys.max()+1, xs.min():xs.max()+1]
    crop = cv2.resize(crop, (64, 64)); mask = cv2.resize(mask * 255, (64, 64))
    hog = cv2.HOGDescriptor((64, 64), (16, 16), (8, 8), (8, 8), 9)
    f = np.concatenate([hog.compute(crop).ravel(), (mask.ravel() / 255.0) * 0.5])
    return f / (np.linalg.norm(f) + 1e-6)
