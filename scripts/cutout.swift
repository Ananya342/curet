// Removes the background from a pet render using the macOS Vision foreground mask.
// Usage: swift scripts/cutout.swift <input> <output.png> [maxSize]
import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("usage: cutout <input> <output.png> [maxSize]")
    exit(1)
}
let maxSize = args.count > 3 ? CGFloat(Double(args[3]) ?? 512) : 512

guard let src = CIImage(contentsOf: URL(fileURLWithPath: args[1])) else {
    print("cannot read \(args[1])")
    exit(1)
}

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: src)
try handler.perform([request])
guard let result = request.results?.first else {
    print("no foreground found")
    exit(1)
}

let buffer = try result.generateMaskedImage(
    ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
var image = CIImage(cvPixelBuffer: buffer)

let scale = min(1, maxSize / max(image.extent.width, image.extent.height))
if scale < 1 {
    image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
}

let ctx = CIContext()
guard let cg = ctx.createCGImage(image, from: image.extent) else { exit(1) }
let rep = NSBitmapImageRep(cgImage: cg)
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("\(args[2]) \(cg.width)x\(cg.height)")
