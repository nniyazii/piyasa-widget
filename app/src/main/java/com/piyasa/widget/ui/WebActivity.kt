package com.piyasa.widget.ui

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Tam analiz: web uygulamasının analiz sayfaları (mum grafik tezgâhı, hisse, makro, alarmlar) uygulama içinde.
 * Hesap ve grafikler web'dekiyle aynıdır; uygulama yalnızca gösterir. Site dışındaki bağlantılar tarayıcıda açılır.
 */
class WebActivity : ComponentActivity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url
                    if (url.host == Uri.parse(BASE).host) return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                    return true
                }
            }
        }
        val root = FrameLayout(this).apply { addView(web) }
        setContentView(root)
        // Durum çubuğu ve gezinme çubuğunun altında kalmasın
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            insets
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
        })
        if (savedInstanceState == null) web.loadUrl(BASE + "#/" + (intent.getStringExtra(EXTRA_PATH) ?: "analiz")) else web.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }

    companion object {
        const val BASE = "https://nniyazii.github.io/piyasa-widget/"
        private const val EXTRA_PATH = "path"
        /** path: web uygulamasındaki sayfa, örn. "analiz/olaylar?v=GOLD&e=rsi-30&tf=W", "analiz/hisse", "alarmlar" */
        fun open(context: Context, path: String) = context.startActivity(Intent(context, WebActivity::class.java).putExtra(EXTRA_PATH, path))
    }
}
