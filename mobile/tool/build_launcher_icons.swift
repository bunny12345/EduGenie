// Run from mobile/: swift tool/build_launcher_icons.swift
import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = root.appendingPathComponent("assets/branding/logo.png")
let sourceData = try Data(contentsOf: source)
guard let input = NSBitmapImageRep(data: sourceData),
      let original = input.cgImage,
      let emblem = original.cropping(to: CGRect(
        x: 250.0 / 1325 * Double(original.width),
        y: 40.0 / 1187 * Double(original.height),
        width: 830.0 / 1325 * Double(original.width),
        height: 850.0 / 1187 * Double(original.height)
      )) else {
    fatalError("Cannot read the AcademiX logo emblem")
}

func pngData(_ pixels: Int, inset: Double = 0.72) -> Data {
    guard let context = CGContext(
        data: nil, width: pixels, height: pixels, bitsPerComponent: 8,
        bytesPerRow: pixels * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else {
        fatalError("Cannot allocate launcher image")
    }
    context.setFillColor(CGColor(gray: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: pixels, height: pixels))
    context.interpolationQuality = .high
    let scale = Double(pixels) * inset / Double(max(emblem.width, emblem.height))
    let width = Double(emblem.width) * scale
    let height = Double(emblem.height) * scale
    context.draw(emblem, in: CGRect(
        x: (Double(pixels) - width) / 2, y: (Double(pixels) - height) / 2,
        width: width, height: height
    ))
    guard let image = context.makeImage(),
          let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
        fatalError("Cannot encode launcher image")
    }
    return data
}

func render(_ pixels: Int, to destination: URL, inset: Double = 0.72) throws {
    try pngData(pixels, inset: inset).write(to: destination)
}

let android = root.appendingPathComponent("android/app/src/main/res")
for (density, pixels) in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)] {
    try render(pixels, to: android.appendingPathComponent("mipmap-\(density)/ic_launcher.png"))
}
let ios = root.appendingPathComponent("ios/Runner/Assets.xcassets/AppIcon.appiconset")
struct IconCatalog: Decodable {
    struct Icon: Decodable {
        let filename: String?
        let size: String
        let scale: String
    }
    let images: [Icon]
}
let catalog = try JSONDecoder().decode(
    IconCatalog.self, from: Data(contentsOf: ios.appendingPathComponent("Contents.json"))
)
var written = Set<String>()
for item in catalog.images {
    guard let file = item.filename, written.insert(file).inserted else { continue }
    guard let points = Double(item.size.components(separatedBy: "x")[0]),
          let scale = Double(item.scale.dropLast()) else {
        fatalError("Invalid icon size in the iOS catalog")
    }
    try render(Int((points * scale).rounded()), to: ios.appendingPathComponent(file))
}
try render(512, to: root.appendingPathComponent("assets/branding/store_icon.png"))

let web = root.appendingPathComponent("../web/public")
try sourceData.write(to: web.appendingPathComponent("logo.png"))
try render(192, to: web.appendingPathComponent("logo192.png"))
try render(512, to: web.appendingPathComponent("logo512.png"))
try render(180, to: web.appendingPathComponent("apple-touch-icon.png"))
try render(32, to: web.appendingPathComponent("favicon.png"), inset: 0.9)

// ICO stores multiple PNG sizes so default /favicon.ico requests use the same mark.
func littleEndian(_ number: Int, bytes: Int) -> Data {
    Data((0..<bytes).map { UInt8((number >> (8 * $0)) & 0xff) })
}
let sizes = [16, 32, 48, 256]
let images = sizes.map { pngData($0, inset: 0.9) }
var ico = Data([0, 0, 1, 0])
ico.append(littleEndian(sizes.count, bytes: 2))
var offset = 6 + 16 * sizes.count
for (size, image) in zip(sizes, images) {
    ico.append(contentsOf: [UInt8(size % 256), UInt8(size % 256), 0, 0])
    ico.append(littleEndian(1, bytes: 2))
    ico.append(littleEndian(32, bytes: 2))
    ico.append(littleEndian(image.count, bytes: 4))
    ico.append(littleEndian(offset, bytes: 4))
    offset += image.count
}
for image in images { ico.append(image) }
try ico.write(to: web.appendingPathComponent("favicon.ico"))

let flutterWeb = root.appendingPathComponent("web")
try render(32, to: flutterWeb.appendingPathComponent("favicon.png"), inset: 0.9)
for size in [192, 512] {
    try render(size, to: flutterWeb.appendingPathComponent("icons/Icon-\(size).png"))
    try render(size, to: flutterWeb.appendingPathComponent("icons/Icon-maskable-\(size).png"), inset: 0.56)
}
print("Generated matching illustrated branding for web, Android, iOS and store listings.")
