import Foundation

/// 対戦中に読み取った文字と出来事を、対戦ごとにテキストファイルへ残す。
/// 「ファイル」アプリの「このiPhone内 → ポケチャン補助 → logs」からも見られる。
/// 同じ文字が続く間は書かない(画面が変わったときだけ書く)。
final class BattleLogger: ObservableObject {
    @Published private(set) var files: [URL] = []

    static let keep = 30
    private let queue = DispatchQueue(label: "battle-log", qos: .utility)
    private var current: URL?
    private var lastBlock = ""
    private let dir: URL = {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let d = docs.appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    private static let fileName: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "yyyyMMdd-HHmmss"
        return f
    }()
    private static let time: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "HH:mm:ss.S"
        return f
    }()

    init() {
        refresh()
    }

    /// 画面1枚分の読み取り結果を残す
    func record(mode: String, newBattle: Bool, observations: [TextObservation], inputs: [[String: Any]]) {
        // このアプリやホーム画面(縦向き)は残さない
        guard mode != "other" else { return }
        let now = Date()
        let lines = observations.sorted { ($0.y, $0.x) < ($1.y, $1.x) }
            .map { String(format: "  %@ (x%.2f y%.2f w%.2f h%.3f)", $0.text, $0.x, $0.y, $0.w, $0.h) }
        let events = inputs.map { i -> String in
            "  → " + [i["kind"], i["side"], i["name"], i["text"], i["percent"], i["cur"], i["max"]]
                .compactMap { $0.map { "\($0)" } }.joined(separator: " ")
        }
        queue.async {
            if newBattle || self.current == nil { self.startFile(at: now) }
            let block = lines.joined(separator: "\n")
            // 文字も出来事も前と同じなら書かない
            if block == self.lastBlock && events.isEmpty { return }
            var text = "[\(BattleLogger.time.string(from: now))] \(mode)\n"
            if block != self.lastBlock { text += block + "\n" } else { text += "  (文字は前と同じ)\n" }
            if !events.isEmpty { text += events.joined(separator: "\n") + "\n" }
            self.lastBlock = block
            self.append(text)
        }
    }

    func delete(_ url: URL) {
        try? FileManager.default.removeItem(at: url)
        if url == current { current = nil }
        refresh()
    }

    /// 画面に出す内容(長すぎると表示が重くなるので、先頭の一部だけ。全部は共有ボタンから)
    func text(of url: URL) -> String {
        guard let s = try? String(contentsOf: url, encoding: .utf8) else { return "読み込めませんでした" }
        let limit = 200_000
        return s.count > limit ? String(s.prefix(limit)) + "\n…(続きは共有ボタンからファイルで見てください)" : s
    }

    func size(of url: URL) -> String {
        let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    // MARK: - queue の上で動く

    private func startFile(at date: Date) {
        let url = dir.appendingPathComponent("対戦-\(BattleLogger.fileName.string(from: date)).txt")
        FileManager.default.createFile(atPath: url.path, contents: Data())
        current = url
        lastBlock = ""
        // 古い記録は消す
        let all = listFiles()
        for old in all.dropFirst(BattleLogger.keep) { try? FileManager.default.removeItem(at: old) }
        refresh()
    }

    private func append(_ text: String) {
        guard let url = current, let data = text.data(using: .utf8),
              let h = try? FileHandle(forWritingTo: url) else { return }
        h.seekToEndOfFile()
        h.write(data)
        try? h.close()
    }

    private func listFiles() -> [URL] {
        let urls = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return urls.filter { $0.pathExtension == "txt" }.sorted { $0.lastPathComponent > $1.lastPathComponent }
    }

    func refresh() {
        let list = listFiles()
        DispatchQueue.main.async { self.files = list }
    }
}
