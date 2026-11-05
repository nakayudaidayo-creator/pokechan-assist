import ReplayKit
import Network
import CoreMedia
import CoreImage

/// 画面録画の拡張機能。
/// 受け取った画面を横向きに直して縮小し、JPEG にして本体アプリへ送る(0.5秒ごと)。
/// 文字認識や判断は本体アプリ側で行う(拡張機能は使えるメモリが小さいため)。
class SampleHandler: RPBroadcastSampleHandler {
    private var statusConnection: NWConnection?
    private var frameConnection: NWConnection?
    private var frameReady = false
    private var sending = false
    private var lastSent = Date.distantPast
    private var sentCount = 0
    private let ciContext = CIContext(options: [.cacheIntermediates: false])
    private let queue = DispatchQueue(label: "frame-sender")

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        let port = NWEndpoint.Port(rawValue: SharedConfig.udpPort) ?? 50555
        let conn = NWConnection(host: "127.0.0.1", port: port, using: .udp)
        conn.start(queue: queue)
        statusConnection = conn
        connectFrames()
        sendStatus("録画開始")
    }

    override func broadcastFinished() {
        sendStatus("録画終了")
        frameConnection?.cancel()
        statusConnection?.cancel()
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }
        let now = Date()
        guard now.timeIntervalSince(lastSent) >= SharedConfig.frameInterval,
              frameReady, !sending,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastSent = now

        autoreleasepool {
            guard let jpeg = makeJPEG(pixelBuffer, orientation: orientation(of: sampleBuffer)) else { return }
            sending = true
            frameConnection?.send(content: SharedConfig.frameMessage(jpeg), completion: .contentProcessed { [weak self] error in
                guard let self else { return }
                self.queue.async {
                    self.sending = false
                    if error == nil {
                        self.sentCount += 1
                        if self.sentCount % 20 == 1 { self.sendStatus("画面を送信中(\(self.sentCount)枚)") }
                    }
                }
            })
        }
    }

    // MARK: - 画像

    /// 画面の向き(ゲームが横向きでも、届く画像は縦向きのことがある)
    private func orientation(of sampleBuffer: CMSampleBuffer) -> CGImagePropertyOrientation {
        if let n = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber,
           let o = CGImagePropertyOrientation(rawValue: n.uint32Value) {
            return o
        }
        return .up
    }

    private func makeJPEG(_ pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) -> Data? {
        var image = CIImage(cvPixelBuffer: pixelBuffer).oriented(orientation)
        // 向きの情報がなく縦長のままなら、横向きに回す
        if image.extent.height > image.extent.width {
            image = image.oriented(.right)
        }
        let scale = min(1, SharedConfig.frameWidth / image.extent.width)
        image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let quality = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
        return ciContext.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(), options: [quality: 0.7])
    }

    // MARK: - 送信

    private func connectFrames() {
        frameReady = false
        let port = NWEndpoint.Port(rawValue: SharedConfig.framePort) ?? 50556
        let conn = NWConnection(host: "127.0.0.1", port: port, using: .tcp)
        conn.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.frameReady = true
                self.sending = false
            case .failed, .cancelled:
                self.frameReady = false
                // 本体アプリが起動していないなどで切れたら、少し待ってつなぎ直す
                if self.frameConnection === conn {
                    self.queue.asyncAfter(deadline: .now() + 2) { self.connectFrames() }
                }
            case .waiting:
                self.frameReady = false
                self.queue.asyncAfter(deadline: .now() + 2) {
                    if self.frameConnection === conn, !self.frameReady {
                        conn.cancel()
                    }
                }
            default:
                break
            }
        }
        frameConnection = conn
        conn.start(queue: queue)
    }

    private func sendStatus(_ text: String) {
        statusConnection?.send(content: text.data(using: .utf8), completion: .contentProcessed { _ in })
    }
}
