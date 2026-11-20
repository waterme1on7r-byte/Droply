package com.droply.android

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    data class PickerJob(val type: String, val callbackId: String? = null, val transferId: String? = null)

    private lateinit var webView: WebView
    lateinit var backend: DroplyBackend
        private set
    private var fileResult: ValueCallback<Array<Uri>>? = null
    private val pickerQueue = ArrayDeque<PickerJob>()
    private var activePicker: PickerJob? = null
    private var notificationPermissionRequested = false
    @Volatile var droplyForeground: Boolean = false
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(14, 21, 35)
        window.navigationBarColor = android.graphics.Color.rgb(13, 21, 36)
        webView = WebView(this)
        webView.setBackgroundColor(android.graphics.Color.rgb(14, 21, 35))
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = true
            safeBrowsingEnabled = true
        }
        backend = DroplyBackend(this, webView)
        webView.addJavascriptInterface(DroplyBridge(backend), "DroplyAndroid")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return true
                return !url.startsWith("file:///android_asset/www/")
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?, callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams?
            ): Boolean {
                fileResult?.onReceiveValue(null)
                fileResult = callback
                return try {
                    val intent = params?.createIntent() ?: Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                    intent.addCategory(Intent.CATEGORY_OPENABLE)
                    intent.type = "*/*"
                    if (params?.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                    startActivityForResult(intent, REQUEST_FILES)
                    true
                } catch (_: Exception) {
                    fileResult = null
                    callback.onReceiveValue(null)
                    false
                }
            }
        }
        setContentView(webView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    fun enqueuePicker(job: PickerJob) {
        runOnUiThread {
            pickerQueue.addLast(job)
            launchNextPicker()
        }
    }

    fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33 || notificationPermissionRequested) return
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        notificationPermissionRequested = true
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATIONS)
    }

    private fun launchNextPicker() {
        if (activePicker != null || pickerQueue.isEmpty()) return
        val job = pickerQueue.removeFirst()
        activePicker = job
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            }
            startActivityForResult(intent, REQUEST_TREE)
        } catch (_: Exception) {
            activePicker = null
            when (job.type) {
                "downloads" -> backend.resolve(job.callbackId, "Downloads/Droply", "Could not open the folder picker")
                "receive-folder" -> backend.completeReceiveFolder(job.transferId.orEmpty(), null)
                else -> backend.reportFolderSelection(null)
            }
            launchNextPicker()
        }
    }

    @Deprecated("Android document picker result callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_FILES) {
            val callback = fileResult ?: return
            fileResult = null
            if (resultCode != RESULT_OK) { callback.onReceiveValue(null); return }
            val uris = mutableListOf<Uri>()
            data?.data?.let(uris::add)
            data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let(uris::add) }
            callback.onReceiveValue(uris.distinct().toTypedArray())
            return
        }
        if (requestCode != REQUEST_TREE) return
        val job = activePicker
        activePicker = null
        val uri = if (resultCode == RESULT_OK) data?.data else null
        if (uri != null) {
            val flags = data?.flags ?: 0
            try { contentResolver.takePersistableUriPermission(uri, flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)) } catch (_: Exception) {}
        }
        when (job?.type) {
            "downloads" -> backend.completeDownloadsFolder(job.callbackId.orEmpty(), uri)
            "receive-folder" -> backend.completeReceiveFolder(job.transferId.orEmpty(), uri)
            "send-folder" -> backend.reportFolderSelection(uri)
        }
        launchNextPicker()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            webView.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));", null)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onResume() {
        super.onResume()
        droplyForeground = true
        if (::backend.isInitialized) {
            backend.onAppResumed()
            // Needed for native friend alerts when the WebView is suspended.
            ensureNotificationPermission()
        }
    }

    override fun onPause() {
        droplyForeground = false
        if (::backend.isInitialized) backend.onAppPaused()
        super.onPause()
    }

    override fun onDestroy() {
        fileResult?.onReceiveValue(null)
        fileResult = null
        if (isFinishing) backend.close()
        webView.removeJavascriptInterface("DroplyAndroid")
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val REQUEST_FILES = 7410
        private const val REQUEST_TREE = 7411
        private const val REQUEST_NOTIFICATIONS = 7412
    }
}
