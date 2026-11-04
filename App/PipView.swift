import UIKit

/// 計算エンジンの pipView() が返す、小窓(案A)の表示データ
struct PipViewModel: Decodable {
    struct Known: Decodable {
        struct Value: Decodable { var value: String; var sure: Bool }
        var ability: Value?
        var item: Value?
        var moves: [String]?
    }
    struct Speed: Decodable {
        var who: String
        var me: Int
        var opp: Int
        var mySpeedNote: String?
    }
    struct Row: Decodable {
        var move: String
        var min: Double
        var max: Double
        var ko: String
        var used: Bool?
    }

    var title: String
    var waiting: Bool?
    var message: String?
    var oppHpPercent: Double?
    var known: Known?
    var candidates: [String]?
    var speed: Speed?
    var mine: [Row]?
    var theirs: [Row]?
    var note: String?

    static func message(_ text: String) -> PipViewModel {
        PipViewModel(title: "ポケチャン補助", waiting: true, message: text)
    }
}

/// 案Aのレイアウトで小窓の画像を描く
enum PipRenderer {
    static let size = CGSize(width: 500, height: 420)

    private static let bg = UIColor(red: 0.04, green: 0.04, blue: 0.06, alpha: 1)
    private static let panel = UIColor(red: 0.09, green: 0.09, blue: 0.12, alpha: 1)
    private static let track = UIColor(red: 0.14, green: 0.14, blue: 0.18, alpha: 1)
    private static let text = UIColor(white: 0.96, alpha: 1)
    private static let sub = UIColor(white: 0.78, alpha: 1)
    private static let blue = UIColor(red: 0.58, green: 0.77, blue: 0.99, alpha: 1)
    private static let blueBar = UIColor(red: 0.38, green: 0.65, blue: 0.98, alpha: 1)
    private static let blueBarDim = UIColor(red: 0.17, green: 0.37, blue: 0.66, alpha: 1)
    private static let orange = UIColor(red: 0.99, green: 0.73, blue: 0.45, alpha: 1)
    private static let orangeBar = UIColor(red: 0.98, green: 0.57, blue: 0.24, alpha: 1)
    private static let orangeBarDim = UIColor(red: 0.66, green: 0.33, blue: 0.12, alpha: 1)
    private static let green = UIColor(red: 0.53, green: 0.94, blue: 0.67, alpha: 1)
    private static let yellow = UIColor(red: 0.99, green: 0.90, blue: 0.54, alpha: 1)

    static func render(_ m: PipViewModel) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            bg.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            let pad: CGFloat = 16
            var y: CGFloat = 12

            // 見出し
            draw(m.title, at: CGPoint(x: pad, y: y), font: .systemFont(ofSize: 20, weight: .black), color: text)
            if let hp = m.oppHpPercent {
                drawRight("相手HP \(Int(hp))%", right: size.width - pad, y: y + 4, font: .systemFont(ofSize: 14, weight: .semibold), color: sub)
            }
            y += 32

            if m.waiting == true {
                draw(m.message ?? "", at: CGPoint(x: pad, y: y + 8), font: .systemFont(ofSize: 17), color: sub)
                return
            }

            // 判明した情報・型の候補・先手
            let infoHeight: CGFloat = 74
            let infoRect = CGRect(x: pad, y: y, width: size.width - pad * 2, height: infoHeight)
            panel.setFill()
            UIBezierPath(roundedRect: infoRect, cornerRadius: 10).fill()
            var x = pad + 10
            let small = UIFont.systemFont(ofSize: 13)
            let smallBold = UIFont.systemFont(ofSize: 13, weight: .bold)
            if let a = m.known?.ability {
                x = drawPair("特性 ", a.value + (a.sure ? " ✓" : "?"), x: x, y: y + 7, color: a.sure ? green : yellow)
            }
            if let i = m.known?.item {
                x = drawPair("持ち物 ", i.value + (i.sure ? " ✓" : "?"), x: x + 12, y: y + 7, color: i.sure ? green : yellow)
            }
            if let used = m.known?.moves, !used.isEmpty {
                _ = drawPair("技 ", used.prefix(2).joined(separator: "・") + " ✓", x: x + 12, y: y + 7, color: green)
            }
            if let c = m.candidates, !c.isEmpty {
                let first = NSAttributedString(string: c[0], attributes: [.font: smallBold, .foregroundColor: text])
                let rest = c.count > 1 ? " → " + c.dropFirst().joined(separator: " → ") : ""
                let s = NSMutableAttributedString(string: "型の候補:", attributes: [.font: small, .foregroundColor: sub])
                s.append(first)
                s.append(NSAttributedString(string: rest, attributes: [.font: small, .foregroundColor: sub]))
                s.draw(at: CGPoint(x: pad + 10, y: y + 29))
            }
            if let sp = m.speed {
                let who = sp.who == "me" ? "自分が先手" : sp.who == "opp" ? "相手が先手" : "同速"
                let note = (sp.mySpeedNote ?? "").isEmpty ? "" : " \(sp.mySpeedNote!)"
                let s = NSMutableAttributedString(string: "すばやさ:", attributes: [.font: small, .foregroundColor: sub])
                s.append(NSAttributedString(string: who, attributes: [.font: smallBold, .foregroundColor: sp.who == "opp" ? orange : blue]))
                s.append(NSAttributedString(string: "(\(sp.me)\(note) / 相手\(sp.opp))", attributes: [.font: small, .foregroundColor: sub]))
                s.draw(at: CGPoint(x: pad + 10, y: y + 50))
            }
            y += infoHeight + 10

            // こちらの攻撃
            draw("こちらの攻撃", at: CGPoint(x: pad, y: y), font: .systemFont(ofSize: 14, weight: .bold), color: blue)
            y += 22
            for r in (m.mine ?? []).prefix(4) {
                drawRow(r, y: y, bar: blueBar, dim: blueBarDim)
                y += 24
            }
            y += 6

            // 相手の技
            draw("相手のよく使う技", at: CGPoint(x: pad, y: y), font: .systemFont(ofSize: 14, weight: .bold), color: orange)
            y += 22
            for r in (m.theirs ?? []).prefix(4) {
                drawRow(r, y: y, bar: orangeBar, dim: orangeBarDim)
                y += 24
            }

            if let note = m.note, !note.isEmpty {
                draw(note, at: CGPoint(x: pad, y: size.height - 22), font: .systemFont(ofSize: 12), color: sub)
            }
        }
    }

    // MARK: - 部品

    private static func drawRow(_ r: PipViewModel.Row, y: CGFloat, bar: UIColor, dim: UIColor) {
        let pad: CGFloat = 16
        let name = r.move + (r.used == true ? " ✓" : "")
        draw(name, at: CGPoint(x: pad, y: y), font: .systemFont(ofSize: 15), color: text, maxWidth: 140)

        let barX: CGFloat = 166, barW: CGFloat = 150, barY = y + 6
        track.setFill()
        UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW, height: 10), cornerRadius: 5).fill()
        let wMax = barW * CGFloat(min(r.max, 100) / 100)
        let wMin = barW * CGFloat(min(r.min, 100) / 100)
        if wMax > 0 {
            dim.setFill()
            UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: max(wMax, 10), height: 10), cornerRadius: 5).fill()
        }
        if wMin > 0 {
            bar.setFill()
            UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: max(wMin, 10), height: 10), cornerRadius: 5).fill()
        }
        draw("\(Int(r.min))-\(Int(r.max))%", at: CGPoint(x: 328, y: y), font: .monospacedDigitSystemFont(ofSize: 15, weight: .regular), color: sub)
        drawRight(r.ko, right: size.width - pad, y: y, font: .systemFont(ofSize: 15, weight: .bold), color: text)
    }

    @discardableResult
    private static func drawPair(_ label: String, _ value: String, x: CGFloat, y: CGFloat, color: UIColor) -> CGFloat {
        let s = NSMutableAttributedString(string: label, attributes: [.font: UIFont.systemFont(ofSize: 13), .foregroundColor: sub])
        s.append(NSAttributedString(string: value, attributes: [.font: UIFont.systemFont(ofSize: 13, weight: .bold), .foregroundColor: color]))
        s.draw(at: CGPoint(x: x, y: y))
        return x + s.size().width
    }

    private static func draw(_ s: String, at p: CGPoint, font: UIFont, color: UIColor, maxWidth: CGFloat? = nil) {
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        if let w = maxWidth {
            (s as NSString).draw(with: CGRect(x: p.x, y: p.y, width: w, height: font.lineHeight + 2),
                                 options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: attrs, context: nil)
        } else {
            (s as NSString).draw(at: p, withAttributes: attrs)
        }
    }

    private static func drawRight(_ s: String, right: CGFloat, y: CGFloat, font: UIFont, color: UIColor) {
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        let w = (s as NSString).size(withAttributes: attrs).width
        (s as NSString).draw(at: CGPoint(x: right - w, y: y), withAttributes: attrs)
    }
}
