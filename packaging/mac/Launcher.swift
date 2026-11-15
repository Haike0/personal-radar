// ReadMe for macOS: a menu-bar launcher around the bundled Node.js and the app.
// It starts the local server (which opens the browser), shows a menu-bar icon with "Open" and "Quit",
// and stops the server when you quit. Nothing here talks to the network except http://localhost.
import Cocoa

let port = "3210"
let home = URL(string: "http://localhost:\(port)")!

func tr(_ zh: String, _ ja: String, _ en: String) -> String {
  let lang = Locale.preferredLanguages.first ?? "en"
  if lang.hasPrefix("zh") { return zh }
  if lang.hasPrefix("ja") { return ja }
  return en
}

/// Is a ReadMe server already answering on this computer?
func alreadyRunning() -> Bool {
  var ok = false
  let done = DispatchSemaphore(value: 0)
  var req = URLRequest(url: home.appendingPathComponent("api/health"))
  req.timeoutInterval = 1
  URLSession.shared.dataTask(with: req) { _, res, _ in
    ok = (res as? HTTPURLResponse)?.statusCode == 200
    done.signal()
  }.resume()
  _ = done.wait(timeout: .now() + 1.5)
  return ok
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  var item: NSStatusItem!
  var server: Process?

  func applicationDidFinishLaunching(_ note: Notification) {
    if alreadyRunning() { NSWorkspace.shared.open(home); NSApp.terminate(nil); return }

    item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    if let img = Bundle.main.image(forResource: "StatusIcon") {
      img.isTemplate = true
      img.size = NSSize(width: 18, height: 18)
      item.button?.image = img
    } else {
      item.button?.title = "R"
    }
    item.button?.toolTip = "ReadMe"
    let menu = NSMenu()
    menu.addItem(withTitle: tr("打开 ReadMe", "ReadMe を開く", "Open ReadMe"), action: #selector(openUI), keyEquivalent: "o")
    menu.addItem(.separator())
    menu.addItem(withTitle: tr("退出 ReadMe", "ReadMe を終了", "Quit ReadMe"), action: #selector(quit), keyEquivalent: "q")
    item.menu = menu
    start()
  }

  func start() {
    guard let res = Bundle.main.resourceURL else { return }
    let p = Process()
    p.executableURL = res.appendingPathComponent("node/bin/node")
    p.arguments = [res.appendingPathComponent("app/bin/radar.mjs").path, "--port", port]
    // keep a log next to the other app logs, so problems can be reported
    let logs = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs")
    try? FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
    let log = logs.appendingPathComponent("ReadMe.log")
    if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil) }
    if let h = try? FileHandle(forWritingTo: log) { h.seekToEndOfFile(); p.standardOutput = h; p.standardError = h }
    p.terminationHandler = { _ in DispatchQueue.main.async { NSApp.terminate(nil) } }
    do { try p.run(); server = p } catch {
      let a = NSAlert()
      a.messageText = tr("ReadMe 没能启动", "ReadMe を起動できませんでした", "ReadMe couldn't start")
      a.informativeText = error.localizedDescription
      a.runModal()
      NSApp.terminate(nil)
    }
  }

  @objc func openUI() { NSWorkspace.shared.open(home) }
  @objc func quit() { NSApp.terminate(nil) }

  // double-clicking the app again opens the page
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { openUI(); return false }

  func applicationWillTerminate(_ note: Notification) {
    guard let p = server, p.isRunning else { return }
    p.terminationHandler = nil
    p.terminate()
    p.waitUntilExit()
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
