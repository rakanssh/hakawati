package dev.hakawati.app

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // The app opens on its dark theme; the web UI updates the icons when the theme changes.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    initSecretStore(applicationContext)
    resizeForKeyboard()
  }

  // Lets the Rust secret store reach the Android Keystore. super.onCreate loads the library.
  private external fun initSecretStore(context: Context)

  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(SystemBars(), "HakawatiSystemBars")
  }

  // Edge-to-edge windows no longer resize for the keyboard, so shrink the content
  // above it. While it is open the web view gets no bottom insets, or it would leave
  // room for the navigation bar and keyboard a second time.
  private fun resizeForKeyboard() {
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      view.setPadding(0, 0, 0, keyboard)
      if (keyboard == 0) return@setOnApplyWindowInsetsListener insets
      val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
      WindowInsetsCompat.Builder(insets)
        .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
        .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(nav.left, nav.top, nav.right, 0))
        .build()
    }
  }

  private inner class SystemBars {
    @JavascriptInterface
    fun setDarkIcons(dark: Boolean) {
      runOnUiThread {
        WindowCompat.getInsetsController(window, window.decorView).apply {
          isAppearanceLightStatusBars = dark
          isAppearanceLightNavigationBars = dark
        }
      }
    }
  }
}
