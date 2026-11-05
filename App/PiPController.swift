import AVKit
import UIKit

/// 小窓(ピクチャ・イン・ピクチャ)に画像を表示する。
/// 動画の代わりに、描いた画像を0.5秒ごとに流し込む。
final class PiPController: NSObject, ObservableObject {
    let displayLayer = AVSampleBufferDisplayLayer()

    @Published var isActive = false
    @Published var lastError: String?

    /// 小窓に表示する画像。呼ばれるたびに最新の内容を返す
    var imageProvider: () -> UIImage = { PipRenderer.render(.message("待機中")) }

    private var pipController: AVPictureInPictureController?
    private var timer: Timer?

    func setup() {
        guard pipController == nil else { return }

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            lastError = "音声の設定に失敗: \(error.localizedDescription)"
        }

        displayLayer.videoGravity = .resizeAspect

        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            lastError = "この端末は小窓(PiP)に対応していません"
            return
        }

        let source = AVPictureInPictureController.ContentSource(
            sampleBufferDisplayLayer: displayLayer,
            playbackDelegate: self
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.delegate = self
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        hideControls(controller)
        pipController = controller

        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.renderFrame()
        }
        renderFrame()
    }

    /// 小窓の再生・停止と10秒戻し・送りのボタンを出さない。
    /// 戻し・送りは公開の設定で消せる。再生・停止は公開の設定がないので、
    /// iOS が内部で持っている表示の切り替え(controlsStyle)を、ある場合だけ使う(自分用アプリのため)
    private func hideControls(_ controller: AVPictureInPictureController) {
        controller.requiresLinearPlayback = true
        let key = "controlsStyle"
        if controller.responds(to: NSSelectorFromString("setControlsStyle:")) {
            controller.setValue(1, forKey: key)
        }
    }

    func start() {
        guard let pipController else { return }
        if pipController.isPictureInPicturePossible {
            pipController.startPictureInPicture()
        } else {
            lastError = "まだ小窓を開始できません。数秒待ってからもう一度押してください"
        }
    }

    func stop() {
        pipController?.stopPictureInPicture()
    }

    // MARK: - 描画

    private func renderFrame() {
        let image = imageProvider()
        guard let pixelBuffer = makePixelBuffer(from: image),
              let sampleBuffer = makeSampleBuffer(from: pixelBuffer) else { return }

        if displayLayer.status == .failed {
            displayLayer.flush()
        }
        displayLayer.enqueue(sampleBuffer)
    }

    private func makePixelBuffer(from image: UIImage) -> CVPixelBuffer? {
        guard let cgImage = image.cgImage else { return nil }
        let width = cgImage.width
        let height = cgImage.height

        let attributes: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true,
            kCVPixelBufferIOSurfacePropertiesKey: [String: Any]()
        ]
        var buffer: CVPixelBuffer?
        CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA,
                            attributes as CFDictionary, &buffer)
        guard let pixelBuffer = buffer else { return nil }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }

        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(pixelBuffer),
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        ) else { return nil }

        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        return pixelBuffer
    }

    private func makeSampleBuffer(from pixelBuffer: CVPixelBuffer) -> CMSampleBuffer? {
        var formatDescription: CMVideoFormatDescription?
        CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescriptionOut: &formatDescription
        )
        guard let formatDescription else { return nil }

        var timing = CMSampleTimingInfo(
            duration: .invalid,
            presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
            decodeTimeStamp: .invalid
        )
        var sampleBuffer: CMSampleBuffer?
        CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: formatDescription,
            sampleTiming: &timing,
            sampleBufferOut: &sampleBuffer
        )
        guard let sampleBuffer else { return nil }

        // すぐに表示させる
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true),
           CFArrayGetCount(attachments) > 0 {
            let dict = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(
                dict,
                Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                Unmanaged.passUnretained(kCFBooleanTrue).toOpaque()
            )
        }
        return sampleBuffer
    }
}

// MARK: - 小窓の状態

extension PiPController: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        isActive = true
        lastError = nil
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        isActive = false
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    failedToStartPictureInPictureWithError error: Error) {
        isActive = false
        lastError = "小窓を開始できません: \(error.localizedDescription)"
    }
}

// MARK: - 再生の扱い(常に「再生中・終わりなし」として扱う)

extension PiPController: AVPictureInPictureSampleBufferPlaybackDelegate {
    func pictureInPictureController(_ controller: AVPictureInPictureController, setPlaying playing: Bool) {}

    func pictureInPictureControllerTimeRangeForPlayback(_ controller: AVPictureInPictureController) -> CMTimeRange {
        CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)
    }

    func pictureInPictureControllerIsPlaybackPaused(_ controller: AVPictureInPictureController) -> Bool {
        false
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    didTransitionToRenderSize newRenderSize: CMVideoDimensions) {}

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    skipByInterval skipInterval: CMTime,
                                    completion completionHandler: @escaping () -> Void) {
        completionHandler()
    }
}
