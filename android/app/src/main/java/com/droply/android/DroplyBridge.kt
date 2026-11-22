package com.droply.android

import android.webkit.JavascriptInterface
import org.json.JSONObject

class DroplyBridge(private val backend: DroplyBackend) {
    @JavascriptInterface fun deviceMode(): String = backend.deviceMode
    @JavascriptInterface fun getProfile(): String = backend.profile().toString()
    @JavascriptInterface fun saveProfile(value: String): String = backend.saveProfile(value).toString()
    @JavascriptInterface fun getFriends(): String = backend.friends().toString()
    @JavascriptInterface fun saveFriends(value: String) = backend.saveFriends(value)
    @JavascriptInterface fun getSettings(): String = backend.settings().toString()
    @JavascriptInterface fun saveSettings(value: String): String = backend.saveSettings(value).toString()
    @JavascriptInterface fun getHistory(): String = backend.history().toString()
    @JavascriptInterface fun clearHistory() = backend.clearHistory()
    @JavascriptInterface fun recordTransfer(value: String) = backend.recordTransfer(value)
    @JavascriptInterface fun getAccess(): String = backend.accessState().toString()
    @JavascriptInterface fun connectServer(): String = backend.connectServer().toString()
    @JavascriptInterface fun sendSignal(value: String) = backend.sendSignal(value)
    @JavascriptInterface fun notify(kind: String, body: String) = backend.notify(kind, body)
    @JavascriptInterface fun copy(text: String) = backend.copy(text)
    @JavascriptInterface fun shareQrImage(dataUrl: String, code: String): Boolean = backend.activity.shareQrImage(dataUrl, code)
    @JavascriptInterface fun copyQrImage(dataUrl: String, code: String): Boolean = backend.activity.copyQrImage(dataUrl, code)
    @JavascriptInterface fun saveQrImage(dataUrl: String, code: String): Boolean = backend.activity.saveQrImage(dataUrl, code)
    @JavascriptInterface fun saveOpen(tid: String, name: String, size: Long): Boolean = backend.saveOpen(tid, name, size)
    @JavascriptInterface fun saveChunk(tid: String, base64: String) = backend.saveChunk(tid, base64)
    @JavascriptInterface fun saveClose(tid: String) = backend.saveClose(tid)
    @JavascriptInterface fun saveAbort(tid: String) = backend.saveAbort(tid)
    @JavascriptInterface fun finishReceive(tid: String) = backend.finishReceive(tid)
    @JavascriptInterface fun freeSpace(tid: String): Long = backend.freeSpace(tid)
    @JavascriptInterface fun showFile(uri: String) = backend.showFile(uri)
    @JavascriptInterface fun setTransferActive(active: Boolean) = backend.setTransferActive(active)
    @JavascriptInterface fun pickFolder() = backend.startFolderPicker()
    @JavascriptInterface fun readFileChunk(uri: String, offset: Long, length: Int): String = backend.readFileChunk(uri, offset, length)

    @JavascriptInterface fun enrollDevice(args: String, callbackId: String) =
        backend.enrollDevice(readArgs(args).optString(0), callbackId)

    @JavascriptInterface fun chooseDownloads(args: String, callbackId: String) =
        backend.activity.enqueuePicker(MainActivity.PickerJob("downloads", callbackId = callbackId))

    @JavascriptInterface fun openDownloads(args: String, callbackId: String) = backend.openDownloads(callbackId)

    @JavascriptInterface fun prepareReceive(args: String, callbackId: String) {
        val values = readArgs(args)
        backend.prepareReceive(values.optString(0), values.optJSONArray(1), callbackId)
    }

    @JavascriptInterface fun historyFile(args: String, callbackId: String) {
        val values = readArgs(args)
        backend.showHistoryFile(values.optString(0), values.optBoolean(1), callbackId)
    }

    @JavascriptInterface fun openGithub() = backend.openExternal("https://github.com/waterme1on7r-byte/Droply")
    @JavascriptInterface fun openLog() = backend.openLog()
    @JavascriptInterface fun copyDiagnostics() = backend.copyDiagnostics()
    @JavascriptInterface fun checkUpdates() = backend.checkUpdates()

    private fun readArgs(value: String): org.json.JSONArray = try { org.json.JSONArray(value) } catch (_: Exception) { org.json.JSONArray() }
}
