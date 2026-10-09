import ExpoModulesCore
import Vision
import UIKit
import CoreImage
import ImageIO
import CoreML

public final class ClosetLocalAIModule: Module {
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  public func definition() -> ModuleDefinition {
    Name("ClosetLocalAI")

    AsyncFunction("status") { () -> [String: Any] in
      if #available(iOS 17.0, *) {
        return ["foreground": true, "classification": true, "platform": "ios-vision"]
      }
      return ["foreground": false, "classification": false, "platform": "ios"]
    }

    AsyncFunction("removeBackground") { (source: String, destination: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          guard #available(iOS 17.0, *) else {
            throw ClosetLocalAIError.unsupported("La eliminación de fondo requiere iOS 17 o posterior.")
          }
          let image = try self.loadImage(source)
          let handler = VNImageRequestHandler(cgImage: image, orientation: .up)
          let request = VNGenerateForegroundInstanceMaskRequest()
          try handler.perform([request])
          guard let observation = request.results?.first else {
            throw ClosetLocalAIError.processing("No se ha detectado una prenda en la fotografía.")
          }
          let mask = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
          let cutout = try self.composite(image: image, mask: mask)
          guard let data = UIImage(cgImage: cutout).pngData() else {
            throw ClosetLocalAIError.processing("No se pudo crear la imagen procesada.")
          }
          let outputURL = self.fileURL(destination)
          try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
          try data.write(to: outputURL, options: .atomic)
          promise.resolve(outputURL.absoluteString)
        } catch {
          promise.reject("E_BACKGROUND", error.localizedDescription)
        }
      }
    }

    // Vision can distinguish separate salient objects in a flat-lay.  This is
    // deliberately not used for a person wearing an outfit: in that case iOS
    // correctly returns one person instance, not several garments.
    AsyncFunction("extractForegroundInstances") { (source: String, destinationPrefix: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          guard #available(iOS 17.0, *) else {
            throw ClosetLocalAIError.unsupported("Separar prendas requiere iOS 17 o posterior.")
          }
          let image = try self.loadImage(source)
          let handler = VNImageRequestHandler(cgImage: image, orientation: .up)
          let request = VNGenerateForegroundInstanceMaskRequest()
          try handler.perform([request])
          guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
            throw ClosetLocalAIError.processing("No se detectaron prendas separadas en la fotografía.")
          }
          let prefixURL = self.fileURL(destinationPrefix)
          try FileManager.default.createDirectory(at: prefixURL.deletingLastPathComponent(), withIntermediateDirectories: true)
          var outputs: [String] = []
          for instance in observation.allInstances {
            let mask = try observation.generateScaledMaskForImage(forInstances: IndexSet(integer: Int(instance)), from: handler)
            let cutout = try self.composite(image: image, mask: mask)
            guard let data = UIImage(cgImage: cutout).pngData() else { continue }
            let outputURL = prefixURL.deletingPathExtension().appendingPathExtension("piece-\(instance).png")
            try data.write(to: outputURL, options: .atomic)
            outputs.append(outputURL.absoluteString)
          }
          guard !outputs.isEmpty else { throw ClosetLocalAIError.processing("No se pudieron extraer las prendas.") }
          promise.resolve(outputs)
        } catch {
          promise.reject("E_INSTANCES", error.localizedDescription)
        }
      }
    }

    AsyncFunction("analyze") { (source: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          guard #available(iOS 17.0, *) else {
            promise.resolve(["labels": [], "dominantColor": self.dominantColor(try self.loadImage(source)), "available": false])
            return
          }
          let image = try self.loadImage(source)
          let request = VNClassifyImageRequest()
          try VNImageRequestHandler(cgImage: image, orientation: .up).perform([request])
          let labels = (request.results ?? []).prefix(12).map { item in
            ["identifier": item.identifier, "confidence": Double(item.confidence)]
          }
          promise.resolve(["labels": labels, "dominantColor": self.dominantColor(image), "available": true])
        } catch {
          promise.reject("E_ANALYZE", error.localizedDescription)
        }
      }
    }

    AsyncFunction("generateFlatLay") { (source: String, destination: String, prompt: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let payload: NSDictionary = ["source": source, "destination": destination, "prompt": prompt]
          let selector = NSSelectorFromString("generate:")
          guard let bridge = NSClassFromString("LocalDiffusionBridge") as? NSObject.Type, bridge.responds(to: selector), let result = bridge.perform(selector, with: payload)?.takeUnretainedValue() as? String else {
            throw ClosetLocalAIError.processing("El generador local no se ha podido cargar.")
          }
          promise.resolve(result)
        } catch {
          promise.reject("E_FLAT_LAY", error.localizedDescription)
        }
      }
    }
  }

  private func fileURL(_ value: String) -> URL {
    URL(string: value)?.isFileURL == true ? URL(string: value)! : URL(fileURLWithPath: value)
  }

  private func loadImage(_ value: String) throws -> CGImage {
    let url = fileURL(value)
    guard let image = UIImage(contentsOfFile: url.path)?.cgImage else {
      throw ClosetLocalAIError.invalidImage("No se pudo leer la fotografía seleccionada.")
    }
    return image
  }

  @available(iOS 17.0, *)
  private func composite(image: CGImage, mask: CVPixelBuffer) throws -> CGImage {
    let maskImage = CIImage(cvPixelBuffer: mask)
    guard let cgMask = ciContext.createCGImage(maskImage, from: maskImage.extent) else {
      throw ClosetLocalAIError.processing("No se pudo crear la máscara local.")
    }
    guard let context = CGContext(
      data: nil,
      width: image.width,
      height: image.height,
      bitsPerComponent: 8,
      bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      throw ClosetLocalAIError.processing("No se pudo preparar el recorte local.")
    }
    context.clip(to: CGRect(x: 0, y: 0, width: image.width, height: image.height), mask: cgMask)
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    guard let output = context.makeImage() else {
      throw ClosetLocalAIError.processing("No se pudo generar la transparencia.")
    }
    return output
  }

  private func dominantColor(_ image: CGImage) -> String {
    let ciImage = CIImage(cgImage: image)
    guard let filter = CIFilter(name: "CIAreaAverage") else { return "" }
    filter.setValue(ciImage, forKey: kCIInputImageKey)
    filter.setValue(CIVector(cgRect: ciImage.extent), forKey: kCIInputExtentKey)
    guard let output = filter.outputImage else { return "" }
    var pixel = [UInt8](repeating: 0, count: 4)
    ciContext.render(output, toBitmap: &pixel, rowBytes: 4, bounds: CGRect(x: 0, y: 0, width: 1, height: 1), format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
    let r = Int(pixel[0]), g = Int(pixel[1]), b = Int(pixel[2])
    let maximum = max(r, g, b), minimum = min(r, g, b)
    if maximum < 55 { return "Negro" }
    if minimum > 205 { return "Blanco" }
    if maximum - minimum < 25 { return "Gris" }
    if r > b + 35 && r > g + 20 { return g > 120 ? "Beige" : "Rojo" }
    if b > r + 25 && b > g { return "Azul" }
    if g > r + 20 && g > b { return "Verde" }
    if r > 115 && b > 80 { return "Morado" }
    return "Marrón"
  }
}

private enum ClosetLocalAIError: LocalizedError {
  case unsupported(String)
  case invalidImage(String)
  case processing(String)

  var errorDescription: String? {
    switch self {
    case .unsupported(let message), .invalidImage(let message), .processing(let message): return message
    }
  }
}
