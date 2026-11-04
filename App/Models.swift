import Foundation

/// 能力の並び(SP・実数値の表示に使う)
let statKeys = ["hp", "atk", "def", "spa", "spd", "spe"]
let statLabels = ["hp": "HP", "atk": "こうげき", "def": "ぼうぎょ", "spa": "とくこう", "spd": "とくぼう", "spe": "すばやさ"]

/// パーティの1匹
struct Member: Codable, Identifiable, Hashable {
    var species: String
    var gender: String?
    var nature: String
    var ability: String
    var item: String
    var moves: [String]
    var sp: [String: Int]
    var stats: [String: Int]?

    var id: String { species }

    var spTotal: Int { sp.values.reduce(0, +) }

    /// 計算エンジンに渡す形
    func engineInput() -> [String: Any] {
        [
            "name": species,
            "nature": nature,
            "sp": sp,
            "ability": ability,
            "item": item,
            "moves": moves,
            "gender": gender ?? "",
        ]
    }
}

struct PartyFile: Codable {
    var name: String?
    var members: [Member]
}

/// パーティの保存と読み込み。編集内容は端末に保存し、最初はアプリに入っている party.json を使う
final class PartyStore: ObservableObject {
    @Published var members: [Member] = []
    private let key = "party.v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let saved = try? JSONDecoder().decode([Member].self, from: data),
           !saved.isEmpty {
            members = saved
        } else {
            members = PartyStore.bundled()
        }
    }

    static func bundled() -> [Member] {
        guard let url = Bundle.main.url(forResource: "party", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(PartyFile.self, from: data)
        else { return [] }
        return file.members
    }

    func save() {
        if let data = try? JSONEncoder().encode(members) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    func resetToBundled() {
        members = PartyStore.bundled()
        UserDefaults.standard.removeObject(forKey: key)
    }
}

/// 技1つ分の計算結果
struct DamageRange: Decodable, Hashable {
    var minPercent: Double
    var maxPercent: Double
    var ko: String
}

struct MatchupRow: Decodable, Identifiable, Hashable {
    var move: String
    var category: String?
    var frail: DamageRange?
    var bulky: DamageRange?
    var error: String?

    var id: String { move }
}

/// 「確定2発」→「確2」、「乱数2発(43.0%)」→「乱2」のように短くする
func shortKO(_ text: String) -> String {
    let n = String(text.dropFirst(2).prefix(while: { $0.isNumber }))
    if text.hasPrefix("確定"), !n.isEmpty { return "確\(n)" }
    if text.hasPrefix("乱数"), !n.isEmpty { return "乱\(n)" }
    return text == "確定数なし" ? "-" : text
}

func percentText(_ r: DamageRange) -> String {
    String(format: "%.0f-%.0f%%", r.minPercent, r.maxPercent)
}
