package dev.hakawati.app

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import android.text.TextUtils
import android.view.Gravity
import android.view.KeyEvent
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SignInSheetOpenArgs {
  lateinit var url: String
  lateinit var onEvent: Channel
}

// Shows sign-in pages for the loopback sign-ins, called from sign_in_sheet.rs. In the
// browser, Hakawati is in the background, where some phones freeze it before the
// callback arrives, so the page opens in a window over the app instead. The window
// catches the redirect to the loopback address and hands it to Rust.
@TauriPlugin
class SignInSheetPlugin(private val activity: Activity) : Plugin(activity) {
  private var sheet: Sheet? = null

  @Command
  fun open(invoke: Invoke) {
    val args = invoke.parseArgs(SignInSheetOpenArgs::class.java)
    val redirect = Uri.parse(args.url).getQueryParameter("redirect_uri")
    if (redirect.isNullOrEmpty()) {
      invoke.reject("Invalid sign-in page.")
      return
    }
    activity.runOnUiThread {
      sheet?.close()
      sheet = Sheet(args.url, redirect, args.onEvent)
      invoke.resolve()
    }
  }

  @Command
  fun close(invoke: Invoke) {
    activity.runOnUiThread {
      sheet?.close()
      sheet = null
      invoke.resolve()
    }
  }

  private inner class Sheet(url: String, private val redirect: String, private val events: Channel) {
    private var ended = false
    private val night =
      (activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES
    private val dialog = Dialog(
      activity,
      if (night) android.R.style.Theme_DeviceDefault_NoActionBar
      else android.R.style.Theme_DeviceDefault_Light_NoActionBar,
    )
    private val webView: WebView
    private val address: TextView

    init {
      val context = dialog.context
      address = TextView(context).apply {
        setSingleLine()
        ellipsize = TextUtils.TruncateAt.START
        textSize = 15f
      }
      val closeButton = ImageButton(context).apply {
        setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
        setColorFilter(address.currentTextColor)
        contentDescription = context.getString(android.R.string.cancel)
        background = null
        setOnClickListener { dialog.cancel() }
      }
      val bar = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(closeButton, LinearLayout.LayoutParams(dp(48), dp(48)))
        addView(address, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { marginEnd = dp(16) })
      }
      webView = createWebView(context)
      val root = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        addView(webView, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
      }
      ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
        view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
        WindowInsetsCompat.CONSUMED
      }
      dialog.setContentView(root)
      dialog.window?.let { window ->
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        WindowCompat.getInsetsController(window, window.decorView).apply {
          isAppearanceLightStatusBars = !night
          isAppearanceLightNavigationBars = !night
        }
      }
      dialog.setOnKeyListener { _, keyCode, event ->
        if (keyCode != KeyEvent.KEYCODE_BACK || !webView.canGoBack()) return@setOnKeyListener false
        if (event.action == KeyEvent.ACTION_UP) webView.goBack()
        true
      }
      dialog.setOnDismissListener {
        if (!ended) {
          ended = true
          events.send(JSObject().put("type", "dismissed"))
        }
        webView.destroy()
      }
      address.text = Uri.parse(url).host
      dialog.show()
      webView.loadUrl(url)
    }

    fun close() {
      ended = true
      dialog.dismiss()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(context: android.content.Context) = WebView(context).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
          request.isForMainFrame && intercept(request.url.toString())

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
          if (intercept(url)) view.stopLoading() else address.text = Uri.parse(url).host
        }
      }
    }

    // True for the sign-in callback, which goes to Rust instead of loading, and for
    // links to other apps, which the window ignores.
    private fun intercept(url: String): Boolean {
      if (url.startsWith(redirect)) {
        if (!ended) {
          ended = true
          events.send(JSObject().put("type", "callback").put("url", url))
          activity.window.decorView.post { dialog.dismiss() }
        }
        return true
      }
      val scheme = Uri.parse(url).scheme
      return scheme != "http" && scheme != "https"
    }

    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
  }
}
