import ReplayKit
import Network
import CoreMedia

/// 画面録画の拡張機能。
/// 動作確認用として、受け取ったフレーム数と解像度を1秒ごとに本体アプリへ送る。
/// 送り方は2通り試す:端末内通信(UDP)と App Group(共有領域)。
class SampleHandler: RPBroadcastSampleHandler {
    private var frameCount = 0
    private var lastSent = Date.distantPast
    private var connection: NWConnection?
    private var sharedDefaults: UserDefaults?

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        let port = NWEndpoint.Port(rawValue: SharedConfig.udpPort) ?? 50555
        let conn = NWConnection(host: "127.0.0.1", port: port, using: .udp)
        conn.start(queue: .global(qos: .utility))
        connection = conn

        let groupID = SharedConfig.groupID()
        if FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID) != nil {
            sharedDefaults = UserDefaults(suiteName: groupID)
        }
        send("録画開始")
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }
        frameCount += 1

        let now = Date()
        guard now.timeIntervalSince(lastSent) >= 1 else { return }
        lastSent = now

        var size = "?"
        if let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
            size = "\(CVPixelBufferGetWidth(pixelBuffer))x\(CVPixelBufferGetHeight(pixelBuffer))"
        }
        send("フレーム\(frameCount)枚 解像度\(size)")
    }

    override func broadcastFinished() {
        send("録画終了")
        connection?.cancel()
    }

    private func send(_ text: String) {
        connection?.send(content: text.data(using: .utf8), completion: .contentProcessed { _ in })
        sharedDefaults?.set(text, forKey: "lastMessage")
        sharedDefaults?.set(Date().timeIntervalSince1970, forKey: "lastTime")
    }
}
