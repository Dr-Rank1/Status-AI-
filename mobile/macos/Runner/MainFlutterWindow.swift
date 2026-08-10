import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    RegisterGeneratedPlugins(registry: flutterViewController)

    // Enable transparency for flutter_3d_controller WebView layer
    self.isOpaque = false
    self.backgroundColor = NSColor.clear
    self.titlebarAppearsTransparent = true

    super.awakeFromNib()
  }
}
