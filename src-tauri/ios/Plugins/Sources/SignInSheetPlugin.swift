import AuthenticationServices
import Tauri
import UIKit
import WebKit

private struct OpenArgs: Decodable {
  let url: String
  let onDismissed: Channel
}

// Shows sign-in pages for the loopback sign-ins, called from sign_in_sheet.rs. In
// Safari, Hakawati would go to the background, where iOS suspends the listener that
// waits for the sign-in callback, so the page opens in a sheet over the app instead.
class SignInSheetPlugin: Plugin, ASWebAuthenticationPresentationContextProviding {
  private weak var webview: WKWebView?
  private var session: ASWebAuthenticationSession?

  override func load(webview: WKWebView) {
    self.webview = webview
  }

  @objc public func open(_ invoke: Invoke) {
    guard let args = try? invoke.parseArgs(OpenArgs.self),
      let url = URL(string: args.url)
    else {
      invoke.reject("Invalid sign-in page.")
      return
    }
    DispatchQueue.main.async {
      self.dismiss()
      // The loopback listener receives the callback, so no URL scheme ends the
      // session; Hakawati closes the sheet once the callback arrives.
      var started: ASWebAuthenticationSession?
      let session = ASWebAuthenticationSession(url: url, callbackURLScheme: nil) {
        [weak self] _, _ in
        DispatchQueue.main.async {
          // Only a sheet the user closed is still the current one.
          guard let self = self, let started = started, self.session === started else { return }
          self.session = nil
          args.onDismissed.send([:])
        }
      }
      started = session
      session.presentationContextProvider = self
      self.session = session
      guard session.start() else {
        self.session = nil
        invoke.reject("Cannot open the sign-in page.")
        return
      }
      invoke.resolve()
    }
  }

  @objc public func close(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.dismiss()
      invoke.resolve()
    }
  }

  private func dismiss() {
    let active = session
    session = nil
    active?.cancel()
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    return webview?.window ?? ASPresentationAnchor()
  }
}

@_cdecl("init_plugin_sign_in_sheet")
func initSignInSheetPlugin() -> Plugin {
  return SignInSheetPlugin()
}
