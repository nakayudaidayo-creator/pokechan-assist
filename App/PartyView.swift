import SwiftUI
import PhotosUI

/// パーティの一覧(5つまで)と編集、スクショからの取り込み
struct PartyView: View {
    @ObservedObject var party: PartyStore

    @State private var photoItems: [PhotosPickerItem] = []
    @State private var importing = false
    @State private var importResult: ImportResult?
    @State private var importError: String?
    @State private var confirmDelete = false
    @State private var confirmReset = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("使うパーティ", selection: $party.selected) {
                        ForEach(party.parties.indices, id: \.self) { i in
                            Text(party.parties[i].name).tag(i)
                        }
                    }
                    if party.parties.indices.contains(party.selected) {
                        TextField("パーティの名前", text: $party.parties[party.selected].name)
                            .onSubmit { party.save() }
                    }
                } footer: {
                    Text("計算と対戦中の小窓には、ここで選んだパーティを使います(\(party.parties.count)/\(PartyStore.maxParties))")
                }

                Section {
                    PhotosPicker(selection: $photoItems, maxSelectionCount: 2, matching: .images) {
                        Label(importing ? "読み取り中…" : "スクショから取り込む", systemImage: "photo.on.rectangle")
                    }
                    .disabled(importing)
                    if let importError {
                        Text(importError).font(.footnote).foregroundColor(.red)
                    }
                } footer: {
                    Text("ゲームのパーティ画面で「能力」と「ステータス」の2枚を撮って、両方を選んでください。読み取った内容を確認してから保存します。")
                }

                Section(party.currentName) {
                    if party.members.isEmpty {
                        Text("まだ登録されていません。スクショから取り込んでください")
                            .font(.footnote).foregroundColor(.secondary)
                    }
                    ForEach(party.members.indices, id: \.self) { i in
                        NavigationLink {
                            MemberEditView(member: $party.members[i], onSave: party.save)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(party.members[i].species).font(.headline)
                                Text("\(party.members[i].nature)・\(party.members[i].item)")
                                    .font(.footnote).foregroundColor(.secondary)
                            }
                        }
                    }
                }

                Section {
                    Button("新しいパーティを追加") {
                        party.add(name: "パーティ\(party.parties.count + 1)")
                    }
                    .disabled(party.parties.count >= PartyStore.maxParties)
                    Button("このパーティを削除", role: .destructive) { confirmDelete = true }
                        .disabled(party.parties.count <= 1)
                    Button("最初の状態(チーム6だけ)に戻す", role: .destructive) { confirmReset = true }
                }
            }
            .navigationTitle("パーティ")
            .confirmationDialog("「\(party.currentName)」を削除しますか?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("削除", role: .destructive) { party.remove(at: party.selected) }
            }
            .confirmationDialog("登録したパーティをすべて消して、チーム6だけに戻しますか?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("戻す", role: .destructive) { party.resetToBundled() }
            }
            .onChange(of: photoItems) { _, items in
                guard !items.isEmpty else { return }
                runImport(items)
            }
            .sheet(item: $importResult) { result in
                ImportPreviewView(result: result, party: party) {
                    importResult = nil
                }
            }
        }
    }

    /// 選んだ画像を文字認識して、計算エンジンで6匹に組み立てる
    private func runImport(_ items: [PhotosPickerItem]) {
        importing = true
        importError = nil
        Task {
            var images: [[[String: Any]]] = []
            for item in items {
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let ui = UIImage(data: data), let cg = ui.cgImage else { continue }
                let obs = await Task.detached(priority: .userInitiated) { TextRecognizer.recognize(cg) }.value
                images.append(obs.map { $0.dict })
            }
            await MainActor.run {
                importing = false
                photoItems = []
                guard !images.isEmpty else {
                    importError = "画像を読み込めませんでした"
                    return
                }
                if let r = EngineBridge.shared.decode("importParty", ["images": images], as: ImportResult.self), !r.members.isEmpty {
                    importResult = r
                } else {
                    importError = "ポケモンを読み取れませんでした。パーティ画面のスクショか確認してください"
                }
            }
        }
    }
}

/// 取り込み結果
struct ImportResult: Decodable, Identifiable {
    var members: [Member]
    var warnings: [String]
    var id: String { members.map(\.species).joined() }
}

/// 取り込んだ内容の確認と保存先の選択
struct ImportPreviewView: View {
    let result: ImportResult
    @ObservedObject var party: PartyStore
    var onDone: () -> Void

    @State private var newName = ""

    var body: some View {
        NavigationStack {
            List {
                if !result.warnings.isEmpty {
                    Section("確認してください") {
                        ForEach(result.warnings, id: \.self) { Text($0).font(.footnote) }
                    }
                }
                Section("読み取った6匹") {
                    ForEach(result.members) { m in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(m.species).font(.headline)
                            Text("\(m.nature)・\(m.ability)・\(m.item)").font(.footnote)
                            Text(m.moves.joined(separator: " / ")).font(.footnote).foregroundColor(.secondary)
                            Text(statKeys.map { "\(statLabels[$0] ?? $0) \(m.sp[$0] ?? 0)" }.joined(separator: "  "))
                                .font(.caption).foregroundColor(.secondary)
                        }
                    }
                }
                Section {
                    Button("「\(party.currentName)」に上書きして保存") {
                        party.members = result.members
                        party.save()
                        onDone()
                    }
                    if party.parties.count < PartyStore.maxParties {
                        TextField("新しいパーティの名前", text: $newName)
                        Button("新しいパーティとして保存") {
                            party.add(name: newName.isEmpty ? "パーティ\(party.parties.count + 1)" : newName, members: result.members)
                            onDone()
                        }
                    } else {
                        Text("パーティは5つまでです。新しく保存するには、どれかを削除してください")
                            .font(.footnote).foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("取り込みの確認")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("やめる", action: onDone) }
            }
        }
    }
}

/// 1匹の編集
struct MemberEditView: View {
    @Binding var member: Member
    var onSave: () -> Void

    @State private var natures: [String] = []
    @State private var stats: [String: Int] = [:]

    var body: some View {
        Form {
            Section("基本") {
                TextField("ポケモン", text: $member.species)
                Picker("性格", selection: $member.nature) {
                    ForEach(natures.isEmpty ? [member.nature] : natures, id: \.self) { Text($0).tag($0) }
                }
                TextField("特性", text: $member.ability)
                TextField("持ち物", text: $member.item)
            }
            Section {
                ForEach(statKeys, id: \.self) { key in
                    Stepper(value: spBinding(key), in: 0...32) {
                        HStack {
                            Text(statLabels[key] ?? key)
                            Spacer()
                            Text("SP \(member.sp[key] ?? 0)").monospacedDigit()
                            Text("実数値 \(stats[key].map(String.init) ?? "-")")
                                .monospacedDigit().foregroundColor(.secondary)
                        }
                    }
                }
            } header: {
                Text("SP(合計 \(member.spTotal) / 66)")
            } footer: {
                if member.spTotal > 66 {
                    Text("SPの合計が66を超えています").foregroundColor(.red)
                }
            }
            Section("技") {
                ForEach(0..<4, id: \.self) { i in
                    TextField("技\(i + 1)", text: moveBinding(i))
                }
            }
        }
        .navigationTitle(member.species)
        .onAppear {
            if natures.isEmpty { natures = EngineBridge.shared.decode("natureList", as: [String].self) ?? [] }
            updateStats()
        }
        .onChange(of: member) { _, _ in
            updateStats()
            onSave()
        }
    }

    private func spBinding(_ key: String) -> Binding<Int> {
        Binding(get: { member.sp[key] ?? 0 }, set: { member.sp[key] = $0 })
    }

    private func moveBinding(_ i: Int) -> Binding<String> {
        Binding(
            get: { i < member.moves.count ? member.moves[i] : "" },
            set: { value in
                while member.moves.count <= i { member.moves.append("") }
                member.moves[i] = value
            }
        )
    }

    private func updateStats() {
        stats = EngineBridge.shared.decode("stats", member.engineInput(), as: [String: Int].self) ?? [:]
    }
}
