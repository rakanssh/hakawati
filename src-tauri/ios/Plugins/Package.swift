// swift-tools-version:5.3

import PackageDescription

// Hakawati's own iOS plugins. build.rs compiles them against Tauri's Swift API the
// way Tauri plugins are built.
let package = Package(
  name: "HakawatiPlugins",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v13),
  ],
  products: [
    .library(
      name: "HakawatiPlugins",
      type: .static,
      targets: ["HakawatiPlugins"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "HakawatiPlugins",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
