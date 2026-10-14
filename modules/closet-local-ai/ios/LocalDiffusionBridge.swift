import Foundation
import UIKit
import CoreML
import StableDiffusion
import Vision
import CoreImage

@objc(LocalDiffusionBridge)
public final class LocalDiffusionBridge: NSObject {
  @objc public static func generate(_ payload: NSDictionary) -> NSString? {
    guard #available(iOS 16.2, *), let sources = payload["sources"] as? [String], !sources.isEmpty, let destination = payload["destination"] as? String, let prompt = payload["prompt"] as? String, let input = Self.referenceImage(sources), let resources = Bundle.main.resourceURL?.appendingPathComponent("StableDiffusion") else { return nil }
    do {
      let configuration = MLModelConfiguration(); configuration.computeUnits = .cpuAndNeuralEngine
      var request = PipelineConfiguration(prompt: prompt)
      request.startingImage = input
      // Keep the reference strongly: a high strength turns the outfit board
      // into noise and lets SD invent unrelated scenes (houses, rooms, etc.).
      // The JS layer already sends a crop for one garment band at a time.
      request.strength = 0.42; request.stepCount = 32; request.guidanceScale = 9.0
      request.negativePrompt = "house, building, architecture, interior, exterior, room, furniture, sofa, chair, table, bed, kitchen, landscape, scenery, street, car, food, object, collage, multiple items, person, human, body, torso, legs, face, head, hands, arms, feet, skin, mannequin, hanger, model, wearer, room, mirror, background clutter, text, watermark"
      let pipeline = try StableDiffusionPipeline(resourcesAt: resources, controlNet: [], configuration: configuration, disableSafety: true, reduceMemory: true)
      try pipeline.loadResources()
      guard let image = try pipeline.generateImages(configuration: request, progressHandler: { _ in true }).first ?? nil, let data = UIImage(cgImage: image).pngData() else { return nil }
      let url = Self.localURL(destination)
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: url, options: .atomic)
      return url.absoluteString as NSString
    } catch { return nil }
  }

  /// Produces a deterministic garment card when diffusion returns a scene or
  /// cannot run on the device. This is intentionally local and never invents
  /// a replacement object from text alone.
  @objc public static func fallback(_ payload: NSDictionary) -> NSString? {
    guard let sources = payload["sources"] as? [String], !sources.isEmpty,
          let destination = payload["destination"] as? String,
          let image = Self.singleFlatLay(sources),
          let data = UIImage(cgImage: image).pngData() else { return nil }
    do {
      let url = Self.localURL(destination)
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: url, options: .atomic)
      return url.absoluteString as NSString
    } catch { return nil }
  }

  private static func localURL(_ value: String) -> URL {
    if let url = URL(string: value), url.isFileURL { return url }
    return URL(fileURLWithPath: value)
  }

  /// Make a small reference board from the front/back/detail crops. Stable
  /// Diffusion receives all views at once, while the generated output remains
  /// a single clean flat-lay product photograph.
  private static func referenceImage(_ values: [String]) -> CGImage? {
    let images = values.prefix(4).compactMap { UIImage(contentsOfFile: localURL($0).path) }
    guard !images.isEmpty else { return nil }
    let columns = images.count == 1 ? 1 : 2
    let rows = Int(ceil(Double(images.count) / Double(columns)))
    let canvas = CGSize(width: 512, height: 512)
    UIGraphicsBeginImageContextWithOptions(canvas, false, 1)
    defer { UIGraphicsEndImageContext() }
    UIColor.white.setFill()
    UIRectFill(CGRect(origin: .zero, size: canvas))
    let cellWidth = canvas.width / CGFloat(columns)
    let cellHeight = canvas.height / CGFloat(rows)
    for (index, image) in images.enumerated() {
      let prepared: UIImage
      if #available(iOS 17.0, *) {
        prepared = Self.foregroundCutout(image) ?? image
      } else {
        prepared = image
      }
      let cell = CGRect(x: CGFloat(index % columns) * cellWidth, y: CGFloat(index / columns) * cellHeight, width: cellWidth, height: cellHeight).insetBy(dx: 8, dy: 8)
      let scale = min(cell.width / prepared.size.width, cell.height / prepared.size.height)
      let size = CGSize(width: prepared.size.width * scale, height: prepared.size.height * scale)
      let rect = CGRect(x: cell.midX - size.width / 2, y: cell.midY - size.height / 2, width: size.width, height: size.height)
      prepared.draw(in: rect)
    }
    return UIGraphicsGetImageFromCurrentImageContext()?.cgImage
  }

  /// Selects one view for the non-generative fallback. Returning a reference
  /// board here would save a collage as a wardrobe image, which is just as
  /// incorrect as saving a generated room.
  private static func singleFlatLay(_ values: [String]) -> CGImage? {
    guard let original = values.prefix(4).compactMap({ UIImage(contentsOfFile: localURL($0).path) }).first else { return nil }
    let prepared: UIImage
    if #available(iOS 17.0, *) {
      prepared = Self.foregroundCutout(original) ?? original
    } else {
      prepared = original
    }
    let canvas = CGSize(width: 512, height: 512)
    UIGraphicsBeginImageContextWithOptions(canvas, false, 1)
    defer { UIGraphicsEndImageContext() }
    UIColor.white.setFill()
    UIRectFill(CGRect(origin: .zero, size: canvas))
    let cell = CGRect(origin: .zero, size: canvas).insetBy(dx: 28, dy: 28)
    let scale = min(cell.width / prepared.size.width, cell.height / prepared.size.height)
    let size = CGSize(width: prepared.size.width * scale, height: prepared.size.height * scale)
    let rect = CGRect(x: cell.midX - size.width / 2, y: cell.midY - size.height / 2, width: size.width, height: size.height)
    prepared.draw(in: rect)
    return UIGraphicsGetImageFromCurrentImageContext()?.cgImage
  }

  /// Vision is used before diffusion so the model sees clothing pixels rather
  /// than the room, street or wearer surrounding them. If Vision cannot make
  /// a mask, the original view is retained and the JS validator can choose the
  /// deterministic fallback instead of saving a hallucinated scene.
  @available(iOS 17.0, *)
  private static func foregroundCutout(_ image: UIImage) -> UIImage? {
    guard let cgImage = image.cgImage else { return nil }
    do {
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up)
      let request = VNGenerateForegroundInstanceMaskRequest()
      try handler.perform([request])
      guard let observation = request.results?.first, !observation.allInstances.isEmpty else { return nil }
      let mask = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
      let maskImage = CIImage(cvPixelBuffer: mask)
      guard let cgMask = CIContext(options: [.useSoftwareRenderer: false]).createCGImage(maskImage, from: maskImage.extent),
            let context = CGContext(data: nil, width: cgImage.width, height: cgImage.height, bitsPerComponent: 8, bytesPerRow: 0,
                                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
      context.clip(to: CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height), mask: cgMask)
      context.draw(cgImage, in: CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height))
      guard let cutout = context.makeImage() else { return nil }
      return UIImage(cgImage: cutout, scale: image.scale, orientation: image.imageOrientation)
    } catch { return nil }
  }
}
