import SwiftUI

/// パーティの一覧と編集
struct PartyView: View {
    @ObservedObject var party: PartyStore
    @State private var confirmReset = false

    var body: some View {
        NavigationStack {
            List {
                Section {
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
                    Button("最初のパーティ(チーム6)に戻す", role: .destructive) { confirmReset = true }
                }
            }
            .navigationTitle("パーティ")
            .confirmationDialog("編集した内容を消して、最初のパーティに戻しますか?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("戻す", role: .destructive) { party.resetToBundled() }
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
