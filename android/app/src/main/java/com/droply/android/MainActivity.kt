package com.droply.android

import android.app.Activity
import android.content.Intent
import android.content.ClipData
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File
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

    // The QR contains only the shareable DRP friend code, never a private key.
    // Validate image format and dimensions before exposing a temporary cache
    // file through a narrowly scoped FileProvider to the user's chosen app.
    fun shareQrImage(dataUrl: String, code: String): Boolean {
        if (!Regex("^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$").matches(code)) return false
        val prefix = "data:image/png;base64,"
        if (!dataUrl.startsWith(prefix) || dataUrl.length > 1_500_000) return false
        return try {
            val bytes = Base64.decode(dataUrl.substring(prefix.length), Base64.DEFAULT)
            val pngMagic = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
            if (bytes.size < 64 || bytes.size > 1_000_000 ||
                !bytes.take(8).toByteArray().contentEquals(pngMagic)) return false
            val dimensions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, dimensions)
            if (dimensions.outWidth !in 100..2048 || dimensions.outHeight !in 100..2048) return false
            val folder = File(cacheDir, "shared_qr").apply { mkdirs() }
            val image = File(folder, "droply-friend-qr.png")
            image.writeBytes(bytes)
            val uri = FileProvider.getUriForFile(this, "$packageName.friendqr", image)
            runOnUiThread {
                try {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "image/png"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        putExtra(Intent.EXTRA_TEXT, "Add me on Droply: $code")
                        clipData = ClipData.newUri(contentResolver, "Droply friend QR", uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    startActivity(Intent.createChooser(send, "Share my Droply QR code"))
                } catch (_: Exception) {
                    // No available sharing target or the activity is closing.
                }
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (intent != null) setIntent(intent)
        if (::backend.isInitialized) backend.refreshPresence()
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
            backend.refreshPresence()
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
