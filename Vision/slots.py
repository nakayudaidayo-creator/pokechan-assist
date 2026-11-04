"""選出画面から相手6枠を見つけて、絵・タイプアイコン・性別マークを切り出す"""
import cv2, numpy as np

def panel_mask(im):
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = (((H >= 160) | (H <= 5)) & (S > 120) & (V > 70) & (V < 200)).astype(np.uint8)
    m[:, : int(im.shape[1] * 0.70)] = 0
    return m

def find_slots(im):
    """右側の赤紫パネルの列を探し、行方向の切れ目で6枠に分ける"""
    h, w = im.shape[:2]
    m = panel_mask(im)
    cols = m.sum(axis=0)
    xs = np.where(cols > cols.max() * 0.5)[0]
    x0, x1 = int(xs.min()), int(xs.max())
    band = m[:, x0 + (x1 - x0) // 4 : x1 - (x1 - x0) // 4]
    rows = band.mean(axis=1) > 0.35
    runs, start = [], None
    for y, on in enumerate(rows):
        if on and start is None: start = y
        if not on and start is not None:
            if y - start > h * 0.05: runs.append((start, y))
            start = None
    # 隣り合う枠は色がつながって1つに見えることがあるので、
    # 単独で見えた枠の高さと間隔から6枠の位置を割り出す
    runs = [r for r in runs if (r[1] - r[0]) > h * 0.08]
    hgt = min(r[1] - r[0] for r in runs)
    singles = [r for r in runs if (r[1] - r[0]) < hgt * 1.3]
    pitch = None
    for a, b in zip(singles, singles[1:]):
        if b[0] - a[0] < hgt * 1.6:
            pitch = b[0] - a[0]; break
    if pitch is None:
        pitch = int(hgt * 1.1)
    # 単独で見えた枠を基準に、1枠目の位置(画面の高さの約14.7%)に最も近くなるよう段数を合わせる
    ref = singles[0][0]
    k = round((ref - h * 0.147) / pitch)
    top = ref - k * pitch
    runs = [(top + i * pitch, top + i * pitch + hgt) for i in range(6)]
    return [(x0, y0, x1, y1) for (y0, y1) in runs[:6]]

def parts(im, slot):
    """1枠から 絵・タイプアイコン2つ・性別マークの領域を切り出す(枠の幅と高さに対する比率で指定)"""
    x0, y0, x1, y1 = slot
    W, H = x1 - x0, y1 - y0
    def crop(a, b, c, d):
        return im[y0 + int(H * b): y0 + int(H * d), x0 + int(W * a): x0 + int(W * c)]
    return {
        'sprite': crop(0.08, 0.02, 0.62, 0.98),
        'type1': crop(0.62, 0.08, 0.78, 0.48),
        'type2': crop(0.80, 0.08, 0.96, 0.48),
        'gender': crop(0.62, 0.62, 0.78, 0.92),
    }
