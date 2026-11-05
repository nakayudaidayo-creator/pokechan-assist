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

/// 登録したパーティ1つ
struct Party: Codable, Identifiable, Hashable {
    var id = UUID()
    var name: String
    var members: [Member]
}

/// パーティの保存と読み込み(5つまで)。編集内容は端末に保存する。
/// 最初はアプリに入っている party.json(チーム6)を1つ目として使う
final class PartyStore: ObservableObject {
    static let maxParties = 5

    @Published var parties: [Party] = [] {
        didSet { save() }
    }
    @Published var selected: Int = 0 {
        didSet { save() }
    }

    private let key = "parties.v2"
    private let oldKey = "party.v1"

    /// 今使っているパーティの6匹(計算・対戦で使う)
    var members: [Member] {
        get { parties.indices.contains(selected) ? parties[selected].members : [] }
        set {
            guard parties.indices.contains(selected) else { return }
            parties[selected].members = newValue
        }
    }

    var currentName: String {
        parties.indices.contains(selected) ? parties[selected].name : ""
    }

    init() {
        struct Saved: Codable { var parties: [Party]; var selected: Int }
        if let data = UserDefaults.standard.data(forKey: key),
           let saved = try? JSONDecoder().decode(Saved.self, from: data),
           !saved.parties.isEmpty {
            parties = saved.parties
            selected = min(max(0, saved.selected), saved.parties.count - 1)
        } else if let data = UserDefaults.standard.data(forKey: oldKey),
                  let old = try? JSONDecoder().decode([Member].self, from: data), !old.isEmpty {
            // 1つだけ登録できた頃の保存内容を引き継ぐ
            parties = [Party(name: "チーム6", members: old)]
        } else {
            parties = [PartyStore.bundled()]
        }
    }

    static func bundled() -> Party {
        guard let url = Bundle.main.url(forResource: "party", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(PartyFile.self, from: data)
        else { return Party(name: "チーム6", members: []) }
        return Party(name: file.name ?? "チーム6", members: file.members)
    }

    func save() {
        struct Saved: Codable { var parties: [Party]; var selected: Int }
        if let data = try? JSONEncoder().encode(Saved(parties: parties, selected: selected)) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    /// 新しいパーティを追加して選ぶ(5つまで)
    @discardableResult
    func add(name: String, members: [Member] = []) -> Bool {
        guard parties.count < PartyStore.maxParties else { return false }
        parties.append(Party(name: name, members: members))
        selected = parties.count - 1
        save()
        return true
    }

    func remove(at index: Int) {
        guard parties.count > 1, parties.indices.contains(index) else { return }
        parties.remove(at: index)
        selected = min(selected, parties.count - 1)
        save()
    }

    func resetToBundled() {
        parties = [PartyStore.bundled()]
        selected = 0
        save()
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
