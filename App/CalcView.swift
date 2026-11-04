import SwiftUI

/// 対戦の前後に、対面を選んで小窓の表示を確かめる画面
struct CalcView: View {
    @ObservedObject var state: AppState
    @ObservedObject var party: PartyStore

    @State private var mineIndex = 0
    @State private var oppName = ""
    @State private var speciesList: [String] = []

    private var suggestions: [String] {
        guard !oppName.isEmpty, !speciesList.contains(oppName) else { return [] }
        return Array(speciesList.filter { $0.hasPrefix(oppName) }.prefix(8))
    }

    private var canShow: Bool {
        speciesList.contains(oppName) && party.members.indices.contains(mineIndex)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("自分") {
                    Picker("ポケモン", selection: $mineIndex) {
                        ForEach(party.members.indices, id: \.self) { i in
                            Text(party.members[i].species).tag(i)
                        }
                    }
                }
                Section("相手") {
                    TextField("ポケモン名(例:ガブリアス)", text: $oppName)
                    ForEach(suggestions, id: \.self) { name in
                        Button(name) { oppName = name }
                    }
                }
                Section {
                    Button("この対面を小窓に表示") { show() }
                        .disabled(!canShow)
                } footer: {
                    Text("対戦中は画面の読み取りで自動的に切り替わります。ここでは対戦の前後に表示を確かめられます。")
                }
                Section("小窓の表示") {
                    Image(uiImage: state.image)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .navigationTitle("ダメージ計算")
            .onAppear {
                if speciesList.isEmpty {
                    speciesList = EngineBridge.shared.decode("speciesList", as: [String].self) ?? []
                }
            }
        }
    }

    private func show() {
        let me = party.members[mineIndex]
        state.startBattle(party: party.members, opponentTeam: [oppName])
        state.feed([
            ["kind": "telop", "text": "ゆけっ! \(me.species)!"],
            ["kind": "telop", "text": "相手トレーナーは \(oppName)を 繰り出した!"],
        ])
    }
}
