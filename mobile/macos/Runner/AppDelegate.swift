import Cocoa
import FlutterMacOS

@main
class AppDelegate: FlutterAppDelegate {
  override func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    return true
  }

  override func applicationDidFinishLaunching(_ notification: Notification) {
    // Transparent window background for 3D GLB models
    if let window = NSApplication.shared.windows.first {
      window.isOpaque = false
      window.backgroundColor = NSColor.clear
      window.titlebarAppearsTransparent = true
    }
    super.applicationDidFinishLaunching(notification)
  }
}
