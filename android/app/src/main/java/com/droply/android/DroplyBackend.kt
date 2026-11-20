package com.droply.android

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.util.Base64
import android.webkit.WebView
import androidx.documentfile.provider.DocumentFile
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.io.FileInputStream
import java.io.OutputStream
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

class DroplyBackend(val activity: MainActivity, private val webView: WebView) {
    private val prefs = activity.getSharedPreferences("droply.android", Context.MODE_PRIVATE)
    private val network: ScheduledExecutorService = Executors.newScheduledThreadPool(2)
    private val io = Executors.newSingleThreadExecutor()
    private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS).writeTimeout(30, TimeUnit.SECONDS)
        // OkHttp sends ping frames and disconnects unresponsive sockets itself.
        // Without this, Android can retain a half-open connection after doze.
        .pingInterval(8, TimeUnit.SECONDS).build()
    private val server = "wss://droply-server-91kh.onrender.com"
    private val origin = "https://droply-server-91kh.onrender.com"
    private val maxTransferBytes = 1L shl 40
    private val maxFiles = 1000
    private val codePattern = Regex("^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$")
    private val idPattern = Regex("^[A-Za-z0-9-]{16,64}$")
    private val tokenPattern = Regex("^[A-Za-z0-9_-]{43}$")
    private val avatarPattern = Regex("^data:image/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$")
    private val lock = Any()
    @Volatile private var socket: WebSocket? = null
    @Volatile private var authenticated = false
    @Volatile private var connecting = false
    @Volatile private var stopped = false
    @Volatile private var accessState = "idle"
    @Volatile private var accessText = "Connecting..."
    private var retryCount = 0
    private var reconnectTask: java.util.concurrent.ScheduledFuture<*>? = null
    private var authTask: java.util.concurrent.ScheduledFuture<*>? = null
    @Volatile private var pausedAt = 0L
    private val pausedFriendRequests = linkedMapOf<String, String>()
    private var transferActive = false
    private var prepareCount = 0
    private val prepared = mutableMapOf<String, PreparedReceive>()
    private val openFiles = mutableMapOf<String, OpenReceive>()
    private val pendingReceive = mutableMapOf<String, String>()
    private val sourceFiles = ConcurrentHashMap<String, Long>()
    private val writerLock = Any()

    val deviceMode: String by lazy {
        when {
            activity.packageManager.hasSystemFeature("android.software.leanback") -> "tv"
            activity.resources.configuration.smallestScreenWidthDp >= 600 -> "tablet"
            else -> "phone"
        }
    }

    data class ManifestFile(val name: String, val size: Long)
    private data class PreparedReceive(val files: List<ManifestFile>, val tree: Uri?, val root: DocumentFile?, val mediaRelativeRoot: String?, var next: Int = 0)
    private data class OpenReceive(val tid: String, val name: String, val size: Long, var written: Long, val uri: Uri, val output: OutputStream, val pendingMediaStore: Boolean, val displayName: String)

    fun profile(): JSONObject = synchronized(lock) {
        val id = prefs.getString("profile_id", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("profile_id", it).commit() }
        JSONObject().put("id", id).put("name", prefs.getString("profile_name", "") ?: "").put("avatar", prefs.getString("profile_avatar", "") ?: "")
    }

    fun saveProfile(raw: String): JSONObject {
        val input = parseObject(raw) ?: JSONObject()
        val name = input.optString("name").trim().take(40)
        val avatar = input.optString("avatar")
        if (name.isEmpty()) throw IllegalArgumentException("Enter your name.")
        if (avatar.isNotEmpty() && (avatar.length >= 60000 || !avatarPattern.matches(avatar))) throw IllegalArgumentException("That profile photo could not be saved.")
        prefs.edit().putString("profile_name", name).putString("profile_avatar", avatar).commit()
        return profile()
    }

    fun friends(): JSONObject = synchronized(lock) { parseObject(prefs.getString("friends", "{}")) ?: JSONObject() }

    fun saveFriends(raw: String) {
        val input = parseObject(raw) ?: return
        val out = JSONObject()
        out.put("friends", cleanPeople(input.optJSONArray("friends"), 200))
        out.put("inc", cleanPeople(input.optJSONArray("inc"), 50))
        val outs = JSONArray()
        val requests = input.optJSONArray("out") ?: JSONArray()
        for (i in 0 until minOf(requests.length(), 100)) {
            val code = requests.optJSONObject(i)?.optString("code") ?: ""
            if (codePattern.matches(code) && (0 until outs.length()).none { outs.optJSONObject(it)?.optString("code") == code }) outs.put(JSONObject().put("code", code))
        }
        val gone = JSONArray(); val removals = input.optJSONArray("gone") ?: JSONArray()
        for (i in 0 until minOf(removals.length(), 200)) {
            val id = removals.optString(i)
            if (idPattern.matches(id) && id != profile().optString("id") && (0 until gone.length()).none { gone.optString(it) == id }) gone.put(id)
        }
        out.put("out", outs).put("gone", gone)
        prefs.edit().putString("friends", out.toString()).apply()
        sendSignal(JSONObject().put("t", "watch").put("friends", JSONArray().also { a -> for (i in 0 until out.optJSONArray("friends")!!.length()) a.put(out.optJSONArray("friends")!!.optJSONObject(i)!!.optString("id")) }).put("codes", JSONArray().also { a -> for (i in 0 until outs.length()) a.put(outs.optJSONObject(i)!!.optString("code")) }).put("notify", gone).toString())
    }

    fun settings(): JSONObject {
        val saved = parseObject(prefs.getString("settings", "{}")) ?: JSONObject()
        val tree = prefs.getString("download_tree", null)
        return JSONObject().put("theme", if (saved.optString("theme") == "light") "light" else "dark")
            .put("askSave", saved.optBoolean("askSave", false))
            .put("friendNotifications", saved.optBoolean("friendNotifications", true))
            .put("incomingNotifications", saved.optBoolean("incomingNotifications", true))
            .put("completedNotifications", saved.optBoolean("completedNotifications", true))
            .put("sounds", saved.optBoolean("sounds", false))
            .put("launchAtStartup", false).put("tray", false).put("startupSupported", false)
            .put("downloadDir", if (tree == null) "Downloads/Droply" else "Selected folder")
            .put("version", "Android 2.8.13")
    }

    fun saveSettings(raw: String): JSONObject {
        val patch = parseObject(raw) ?: throw IllegalArgumentException("Invalid settings")
        val current = settings()
        if (patch.has("theme")) {
            val theme = patch.optString("theme")
            if (theme != "light" && theme != "dark") throw IllegalArgumentException("Invalid theme")
            current.put("theme", theme)
        }
        listOf("askSave", "friendNotifications", "incomingNotifications", "completedNotifications", "sounds").forEach { key -> if (patch.has(key)) current.put(key, patch.optBoolean(key)) }
        current.put("launchAtStartup", false).put("tray", false)
        prefs.edit().putString("settings", current.toString()).apply()
        return current
    }

    fun history(): JSONArray = parseArray(prefs.getString("history", "[]")) ?: JSONArray()

    fun clearHistory() { prefs.edit().putString("history", "[]").apply(); emit("history-changed", history()) }

    fun recordTransfer(raw: String) {
        val item = parseObject(raw) ?: return
        val dir = item.optString("direction"); val state = item.optString("state")
        if (dir !in listOf("in", "out") || state !in listOf("done", "error", "cancelled")) return
        val row = JSONObject().put("id", UUID.randomUUID().toString()).put("name", item.optString("name").take(240))
            .put("peer", item.optString("peer").take(40)).put("direction", dir).put("state", state)
            .put("message", item.optString("message").take(160)).put("date", java.time.Instant.now().toString())
        val next = JSONArray().put(row); val old = history()
        for (i in 0 until minOf(299, old.length())) next.put(old.optJSONObject(i))
        prefs.edit().putString("history", next.toString()).apply(); emit("history-changed", next)
    }

    fun accessState() = JSONObject().put("configured", prefs.contains("credential"))
        .put("encryptionAvailable", true).put("state", accessState).put("text", accessText)

    fun connectServer(): JSONObject {
        ensureConnected()
        return JSONObject().put("state", accessState).put("text", accessText)
    }

    fun onAppPaused() { pausedAt = android.os.SystemClock.elapsedRealtime() }

    fun onAppResumed() {
        if (stopped) return
        val elapsed = if (pausedAt > 0L) android.os.SystemClock.elapsedRealtime() - pausedAt else 0L
        pausedAt = 0L
        // The WebView might have deferred JavaScript while the app was asleep.
        // Replay friend requests to the now-visible UI. Duplicate requests are
        // already de-duplicated by the shared renderer using the sender ID.
        activity.runOnUiThread {
            webView.postDelayed({
                val queued = synchronized(lock) { pausedFriendRequests.toMap() }
                for ((from, raw) in queued) {
                    val envelope = JSONObject().put("t", "server-event").put("data",
                        JSONObject().put("t", "message").put("message", parseObject(raw)))
                    val expr = "(function(){if(typeof window.__droplyAndroidEvent!=='function')return false;" +
                        "window.__droplyAndroidEvent(${JSONObject.quote(envelope.toString())});return true;})()"
                    webView.evaluateJavascript(expr) { value ->
                        if (value == "true") synchronized(lock) {
                            // Only discard the exact event we replayed.
                            if (pausedFriendRequests[from] == raw) pausedFriendRequests.remove(from)
                        }
                    }
                }
                // Display an already-saved request when the WebView becomes active,
                // even if the replay is de-duplicated by the shared renderer.
                webView.evaluateJavascript(
                    "if(typeof showIncomingFriendRequest==='function')showIncomingFriendRequest();", null)
            }, 250L)
        }
        if (elapsed > 10000L) {
            // Proactively re-announce this device after Android doze. The
            // signaling server immediately replays watched friend codes.
            val previous = synchronized(lock) {
                reconnectTask?.cancel(false); reconnectTask = null
                val ws = socket; socket = null; authenticated = false; connecting = false
                retryCount = 0
                ws
            }
            previous?.cancel()
            setAccess("connecting", "Reconnecting after background…")
            ensureConnected()
        } else if (!authenticated) {
            synchronized(lock) { reconnectTask?.cancel(false); reconnectTask = null }
            ensureConnected()
        }
    }

    fun sendSignal(raw: String) {
        if (!authenticated) return
        val message = parseObject(raw) ?: return
        val type = message.optString("t")
        val allowed = when (type) {
            "hello" -> true
            "watch" -> (message.optJSONArray("friends")?.length() ?: 999) <= 200 && (message.optJSONArray("codes")?.length() ?: 999) <= 200 && (message.optJSONArray("notify")?.length() ?: 999) <= 200
            "lookup" -> codePattern.matches(message.optString("code"))
            "sig" -> idPattern.matches(message.optString("to")) && message.optJSONObject("data") != null
            else -> false
        }
        if (!allowed || raw.toByteArray(Charsets.UTF_8).size > 1 shl 20) return
        val outgoing = if (type == "hello") {
            val p = profile(); JSONObject().put("t", "hello").put("id", p.optString("id")).put("name", p.optString("name")).put("av", p.optString("avatar"))
        } else message
        synchronized(lock) { socket?.send(outgoing.toString()) }
    }

    private fun ensureConnected() {
        synchronized(lock) {
            if (stopped || connecting || socket != null) return
            connecting = true
        }
        setAccess("connecting", "Connecting securely...")
        network.execute {
            try {
                var token = readCredential()
                if (token == null) {
                    token = ByteArray(32).also(SecureRandom()::nextBytes).let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }
                    if (!tokenPattern.matches(token)) throw IllegalStateException("Could not create a secure device credential")
                    writeCredential(token, false)
                }
                if (!prefs.getBoolean("registered", false)) {
                    val code = register(token)
                    if (code == 409) { synchronized(lock) { connecting = false }; setAccess("enrollment-required", "This device is already registered. Open Settings → Device access to recover it with a one-time invitation."); return@execute }
                    if (code !in 200..299) throw IllegalStateException("Device registration unavailable")
                    writeCredential(token, true)
                }
                openSocket(token)
            } catch (_: Exception) {
                synchronized(lock) { connecting = false }
                scheduleReconnect()
            }
        }
    }

    private fun register(token: String): Int {
        val body = JSONObject().put("id", profile().optString("id")).put("token", token).toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder().url("$origin/auth/register").post(body).build()
        http.newCall(request).execute().use { response -> return response.code }
    }

    private fun openSocket(token: String) {
        val request = Request.Builder().url("$server/device").build()
        val listener = object : WebSocketListener() {
            private var thisSocket: WebSocket? = null
            override fun onOpen(webSocket: WebSocket, response: Response) {
                thisSocket = webSocket
                synchronized(lock) {
                    if (stopped || socket !== webSocket) { webSocket.cancel(); return }
                    connecting = false
                }
                webSocket.send(JSONObject().put("t", "auth").put("token", token).toString())
                authTask?.cancel(false)
                authTask = network.schedule({ if (!authenticated) webSocket.close(4401, "Authentication timeout") }, 15, TimeUnit.SECONDS)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (socket !== webSocket) return
                val msg = parseObject(text) ?: return
                when (msg.optString("t")) {
                    "authenticated" -> {
                        if (msg.optString("id") != profile().optString("id")) {
                            setAccess("locked", "Server identity mismatch. Ask the administrator for help.")
                            webSocket.close(4401, "Identity mismatch")
                            return
                        }
                        authenticated = true; retryCount = 0; authTask?.cancel(false)
                        val p = profile(); webSocket.send(JSONObject().put("t", "hello").put("id", p.optString("id")).put("name", p.optString("name")).put("av", p.optString("avatar")).toString())
                        setAccess("connected", "Connected securely")
                    }
                    "access-denied" -> { authenticated = false; setAccess("enrollment-required", "This device could not connect. Open Settings → Device access to recover it."); webSocket.close(4401, "Access denied") }
                    "peers", "sig", "resolved" -> {
                        if (msg.optString("t") == "sig" && msg.optJSONObject("data")?.optString("t") == "fr" &&
                            !activity.droplyForeground) {
                            val sender = msg.optString("from")
                            if (idPattern.matches(sender)) {
                                val first = synchronized(lock) {
                                    val isNew = !pausedFriendRequests.containsKey(sender)
                                    pausedFriendRequests[sender] = text
                                    if (pausedFriendRequests.size > 50)
                                        pausedFriendRequests.remove(pausedFriendRequests.keys.first())
                                    isNew
                                }
                                // Native system notification is independent of WebView's
                                // suspended JavaScript event loop.
                                if (first) {
                                    val name = msg.optJSONObject("data")?.optString("name")?.trim()
                                        ?.take(40)?.ifEmpty { "Someone" } ?: "Someone"
                                    notify("friend", "$name wants to add you")
                                }
                            }
                        }
                        emit("server-event", JSONObject().put("t", "message").put("message", msg))
                    }
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = disconnected(webSocket, code)
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = disconnected(webSocket, response?.code ?: 0)
            private fun disconnected(webSocket: WebSocket, code: Int) {
                authTask?.cancel(false)
                val wasCurrent = synchronized(lock) {
                    if (socket !== webSocket) false
                    else { socket = null; connecting = false; authenticated = false; true }
                }
                // A cancelled stale socket must not disrupt a newer connection.
                if (wasCurrent && !stopped && accessState != "enrollment-required" && code != 4401)
                    scheduleReconnect()
            }
        }
        synchronized(lock) { if (stopped) { connecting = false; return }; socket = http.newWebSocket(request, listener) }
    }

    private fun scheduleReconnect() {
        synchronized(lock) {
            if (stopped || reconnectTask != null || accessState == "enrollment-required") return
            setAccess("offline", "Offline - reconnecting securely...")
            val delay = minOf(8L, 1L shl minOf(retryCount++, 3))
            reconnectTask = network.schedule({ synchronized(lock) { reconnectTask = null }; ensureConnected() }, delay, TimeUnit.SECONDS)
        }
    }

    private fun setAccess(state: String, text: String) {
        accessState = state; accessText = text
        emit("server-event", JSONObject().put("t", "state").put("state", state).put("text", text))
    }

    fun enrollDevice(invitation: String, callbackId: String) {
        if (!tokenPattern.matches(invitation.trim())) { resolve(callbackId, false, "Enter the administrator invitation supplied for this device."); return }
        network.execute {
            try {
                val body = JSONObject().put("id", profile().optString("id")).put("invitation", invitation.trim()).toString()
                    .toRequestBody("application/json; charset=utf-8".toMediaType())
                val request = Request.Builder().url("$origin/auth/enroll").post(body).build()
                http.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) { resolve(callbackId, false, if (response.code == 403) "Invitation is invalid, expired, already used, or belongs to another device." else "Secure enrollment is not ready on the server."); return@execute }
                    val result = parseObject(response.body?.string()) ?: throw IllegalStateException("Invalid enrollment response")
                    val token = result.optString("token")
                    if (result.optString("id") != profile().optString("id") || !tokenPattern.matches(token)) throw IllegalStateException("Invalid server enrollment response")
                    writeCredential(token, true)
                    synchronized(lock) { socket?.close(1000, "Re-enrolling"); socket = null; authenticated = false }
                    setAccess("connecting", "Connecting securely..."); ensureConnected(); resolve(callbackId, true, null)
                }
            } catch (_: Exception) { resolve(callbackId, false, "Could not reach the enrollment server. Check your connection.") }
        }
    }

    private fun writeCredential(token: String, registered: Boolean) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, keystoreKey())
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        val packed = cipher.iv + encrypted
        prefs.edit().putString("credential", Base64.encodeToString(packed, Base64.NO_WRAP))
            .putString("credential_origin", origin).putBoolean("registered", registered).commit()
    }

    private fun readCredential(): String? {
        val packedText = prefs.getString("credential", null) ?: return null
        if (prefs.getString("credential_origin", null) != origin) throw IllegalStateException("Credential server changed")
        val packed = Base64.decode(packedText, Base64.NO_WRAP)
        if (packed.size < 29) throw IllegalStateException("Saved device credential is invalid")
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, keystoreKey(), GCMParameterSpec(128, packed.copyOfRange(0, 12)))
        return cipher.doFinal(packed.copyOfRange(12, packed.size)).toString(Charsets.UTF_8).takeIf(tokenPattern::matches)
            ?: throw IllegalStateException("Saved device credential is invalid")
    }

    private fun keystoreKey(): SecretKey {
        val alias = "droply.android.device"
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build())
        return generator.generateKey()
    }

    fun close() {
        stopped = true
        authTask?.cancel(true); reconnectTask?.cancel(true)
        synchronized(lock) { authenticated = false; socket?.close(1000, "App closed"); socket = null }
        network.shutdownNow(); io.shutdownNow(); http.dispatcher.cancelAll()
        synchronized(writerLock) { openFiles.values.forEach { try { it.output.close() } catch (_: Exception) {} }; openFiles.clear(); prepared.clear() }
    }

    private fun cleanPeople(source: JSONArray?, limit: Int): JSONArray {
        val out = JSONArray(); val seen = mutableSetOf<String>(); val input = source ?: JSONArray()
        for (i in 0 until minOf(input.length(), limit)) {
            val item = input.optJSONObject(i) ?: continue
            val id = item.optString("id"); val code = item.optString("code")
            if (!idPattern.matches(id) || id == profile().optString("id") || !codePattern.matches(code) || !seen.add(id)) continue
            val name = item.optString("name").trim().take(40).ifEmpty { "Friend" }
            val avatar = item.optString("av").takeIf { it.length < 60000 && avatarPattern.matches(it) } ?: ""
            out.put(JSONObject().put("id", id).put("code", code).put("name", name).put("av", avatar))
        }
        return out
    }

    private fun parseObject(text: String?): JSONObject? = try { if (text == null) null else JSONObject(text) } catch (_: Exception) { null }
    private fun parseArray(text: String?): JSONArray? = try { if (text == null) null else JSONArray(text) } catch (_: Exception) { null }
    private fun emit(channel: String, data: JSONObject) {
        val event = JSONObject().put("t", channel).put("data", data)
        val expression = "window.__droplyAndroidEvent(${JSONObject.quote(event.toString())})"
        activity.runOnUiThread { webView.evaluateJavascript(expression, null) }
    }
    private fun emit(channel: String, data: JSONArray) {
        val event = JSONObject().put("t", channel).put("data", data)
        val expression = "window.__droplyAndroidEvent(${JSONObject.quote(event.toString())})"
        activity.runOnUiThread { webView.evaluateJavascript(expression, null) }
    }

    fun resolve(callbackId: String?, value: Any?, error: String?) {
        if (callbackId.isNullOrEmpty()) return
        val valueJson = when (value) {
            null -> "null"
            is JSONObject, is JSONArray -> value.toString()
            is String -> JSONObject.quote(value)
            is Boolean, is Number -> value.toString()
            else -> "null"
        }
        val expression = "window.__droplyAndroidResolve(${JSONObject.quote(callbackId)},$valueJson,${error?.let(JSONObject::quote) ?: "null"})"
        activity.runOnUiThread { webView.evaluateJavascript(expression, null) }
    }

    fun copy(text: String) = activity.runOnUiThread {
        val manager = activity.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        manager.setPrimaryClip(android.content.ClipData.newPlainText("Droply", text.take(500)))
    }

    fun openExternal(url: String) = activity.runOnUiThread {
        try { activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) { }
    }

    fun checkUpdates() = openExternal("https://github.com/waterme1on7r-byte/Droply/releases")

    fun copyDiagnostics() {
        val details = "DROPLY Android 2.8.13\nOS: Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\nDevice mode: $deviceMode\nTheme: ${settings().optString("theme")}\nConnection: $accessState"
        copy(details)
    }

    fun openLog() = activity.runOnUiThread { android.widget.Toast.makeText(activity, "Android diagnostics are available with Copy diagnostics.", android.widget.Toast.LENGTH_LONG).show() }

    fun notify(kind: String, body: String) {
        val s = settings()
        if ((kind == "friend" && !s.optBoolean("friendNotifications", true)) ||
            (kind == "incoming" && !s.optBoolean("incomingNotifications", true)) ||
            (kind == "completed" && !s.optBoolean("completedNotifications", true))) return
        activity.runOnUiThread {
            // Never request permissions from a WebSocket callback or while the
            // Activity is backgrounded. Display a notification when permitted.
            if (activity.droplyForeground) activity.ensureNotificationPermission()
            val manager = activity.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("droply-events", "DROPLY", NotificationManager.IMPORTANCE_DEFAULT))
            val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(activity, "droply-events") else @Suppress("DEPRECATION") Notification.Builder(activity)
            val notification = builder.setSmallIcon(R.drawable.ic_droply).setContentTitle("DROPLY").setContentText(body.take(160)).setAutoCancel(true).build()
            val id = (System.nanoTime() and 0x7fffffff).toInt()
            try { manager.notify(id, notification) } catch (_: SecurityException) { }
        }
    }

    fun setTransferActive(active: Boolean) {
        if (active == transferActive) return
        transferActive = active
        activity.runOnUiThread {
            val intent = Intent(activity, TransferService::class.java).setAction(if (active) TransferService.ACTION_START else TransferService.ACTION_STOP)
            try {
                if (active && Build.VERSION.SDK_INT >= 26) activity.startForegroundService(intent) else activity.startService(intent)
            } catch (_: Exception) { }
        }
    }

    fun completeDownloadsFolder(callbackId: String, uri: Uri?) {
        if (uri == null) { resolve(callbackId, settings().optString("downloadDir"), null); return }
        prefs.edit().putString("download_tree", uri.toString()).commit()
        resolve(callbackId, "Selected folder", null)
    }

    fun openDownloads(callbackId: String) {
        val uri = prefs.getString("download_tree", null)?.let(Uri::parse)
        activity.runOnUiThread {
            try {
                val target = uri ?: DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Download/Droply")
                activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(target, "vnd.android.document/directory")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION))
            } catch (_: Exception) { }
            resolve(callbackId, "", null)
        }
    }

    fun showHistoryFile(id: String, reveal: Boolean, callbackId: String) {
        val item = history().let { rows -> (0 until rows.length()).mapNotNull(rows::optJSONObject).firstOrNull { it.optString("id") == id } }
        val uri = item?.optString("path")?.takeIf { it.startsWith("content://") }?.let(Uri::parse)
        if (reveal || uri == null) { openDownloads(callbackId); return }
        showFile(uri.toString()); resolve(callbackId, "", null)
    }

    fun showFile(uriText: String) {
        val uri = try { Uri.parse(uriText) } catch (_: Exception) { return }
        if (uri.scheme != "content") return
        activity.runOnUiThread {
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "*/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            } catch (_: Exception) { }
        }
    }

    fun freeSpace(tid: String): Long {
        val destination = synchronized(writerLock) { prepared[tid] } ?: return -1
        if (destination.tree != null) return -1
        return try { StatFs(Environment.getExternalStorageDirectory().path).availableBytes } catch (_: Exception) { -1 }
    }

    fun prepareReceive(tid: String, files: JSONArray?, callbackId: String) {
        if (!tid.matches(Regex("^[A-Za-z0-9_-]{1,64}$")) || files == null || files.length() !in 1..maxFiles) {
            resolve(callbackId, false, null); return
        }
        val manifest = mutableListOf<ManifestFile>(); var total = 0L
        for (i in 0 until files.length()) {
            val entry = files.optJSONObject(i) ?: run { resolve(callbackId, false, null); return }
            val name = entry.optString("name"); val size = entry.optLong("size", -1)
            if (!validRelativeName(name) || size < 0 || size > maxTransferBytes || total > maxTransferBytes - size) { resolve(callbackId, false, null); return }
            manifest += ManifestFile(name, size); total += size
        }
        synchronized(writerLock) {
            if (prepared.containsKey(tid) || prepared.size >= 10 || pendingReceive.containsKey(tid)) { resolve(callbackId, false, null); return }
            pendingReceive[tid] = callbackId
            pendingFiles[tid] = manifest
        }
        if (!settings().optBoolean("askSave", false)) {
            completeReceiveFolder(tid, null)
        } else {
            activity.enqueuePicker(MainActivity.PickerJob("receive-folder", transferId = tid))
        }
    }

    private val pendingFiles = mutableMapOf<String, List<ManifestFile>>()

    fun completeReceiveFolder(tid: String, uri: Uri?) {
        val callbackId: String
        val files: List<ManifestFile>
        synchronized(writerLock) {
            callbackId = pendingReceive.remove(tid) ?: return
            files = pendingFiles.remove(tid) ?: emptyList()
            if (files.isEmpty() || (settings().optBoolean("askSave", false) && uri == null)) {
                resolve(callbackId, false, null); return
            }
            val folderTransfer = files.any { it.name.contains('/') }
            var root: DocumentFile? = null
            var relativeRoot: String? = null
            val selectedTree = uri ?: prefs.getString("download_tree", null)?.let(Uri::parse)
            if (selectedTree != null) {
                var tree = DocumentFile.fromTreeUri(activity, selectedTree) ?: run { resolve(callbackId, false, null); return }
                if (folderTransfer) tree = uniqueDirectory(tree, "DROPLY transfer") ?: run { resolve(callbackId, false, null); return }
                root = tree
            } else {
                relativeRoot = if (folderTransfer) uniqueMediaDirectory("Download/Droply", "DROPLY transfer") else "Download/Droply"
            }
            prepared[tid] = PreparedReceive(files, uri, root, relativeRoot)
            prepareCount = prepared.size + pendingReceive.size
        }
        resolve(callbackId, true, null)
    }

    fun reportFolderSelection(uri: Uri?) {
        if (uri == null) return
        io.execute {
            try {
                val root = DocumentFile.fromTreeUri(activity, uri) ?: throw IllegalStateException("Could not read this folder")
                val rows = JSONArray(); val collected = mutableListOf<JSONObject>(); val seen = mutableSetOf<String>()
                fun visit(dir: DocumentFile, prefix: String, depth: Int) {
                    if (depth > 32 || collected.size > maxFiles) throw IllegalArgumentException("This folder is too large for one transfer")
                    dir.listFiles().forEach { child ->
                        val title = child.name?.takeIf { it.isNotBlank() } ?: return@forEach
                        val safe = safeSegment(title)
                        if (child.isDirectory) visit(child, "$prefix$safe/", depth + 1)
                        else if (child.isFile) {
                            val size = child.length()
                            if (size < 0 || size > maxTransferBytes) throw IllegalArgumentException("A file in this folder is too large")
                            val relative = "$prefix$safe"
                            if (!seen.add(relative)) throw IllegalArgumentException("This folder contains duplicate file names")
                            if (sourceFiles.size < maxFiles) sourceFiles[child.uri.toString()] = size else throw IllegalArgumentException("Choose up to 1,000 files per transfer")
                            collected += JSONObject().put("uri", child.uri.toString()).put("name", relative).put("size", size)
                        }
                    }
                }
                visit(root, "", 0)
                if (collected.isEmpty()) throw IllegalArgumentException("This folder has no files")
                val total = collected.sumOf { it.optLong("size") }
                if (total > maxTransferBytes) throw IllegalArgumentException("These files exceed DROPLY’s safe transfer limits")
                collected.forEach(rows::put)
                val script = "window.__droplyAndroidFolder(${JSONObject.quote(rows.toString())})"
                activity.runOnUiThread { webView.evaluateJavascript(script, null) }
            } catch (error: Exception) {
                emit("server-event", JSONObject().put("t", "message").put("message", JSONObject().put("t", "android-folder-error").put("text", error.message ?: "Could not read this folder")))
                activity.runOnUiThread { webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('droply-folder-error',{detail:${JSONObject.quote(error.message ?: "Could not read this folder")}}))", null) }
            }
        }
    }

    fun startFolderPicker() {
        sourceFiles.clear()
        activity.enqueuePicker(MainActivity.PickerJob("send-folder"))
    }

    fun readFileChunk(uriText: String, offset: Long, length: Int): String {
        val size = sourceFiles[uriText] ?: return ""
        if (offset < 0 || length !in 1..65536 || offset > size || length.toLong() > size - offset) return ""
        return try {
            val uri = Uri.parse(uriText)
            activity.contentResolver.openFileDescriptor(uri, "r")?.use { descriptor ->
                FileInputStream(descriptor.fileDescriptor).use { input ->
                    var skip = offset
                    while (skip > 0) { val amount = input.skip(skip); if (amount <= 0) throw IllegalStateException("Could not read selected file"); skip -= amount }
                    val bytes = ByteArray(length); var at = 0
                    while (at < length) { val count = input.read(bytes, at, length - at); if (count < 0) throw IllegalStateException("Selected file changed during transfer"); at += count }
                    Base64.encodeToString(bytes, Base64.NO_WRAP)
                }
            } ?: ""
        } catch (_: Exception) { "" }
    }

    fun saveOpen(tid: String, rawName: String, size: Long): Boolean = synchronized(writerLock) {
        try {
            val destination = prepared[tid] ?: return false
            if (openFiles.containsKey(tid) || size < 0 || size > maxTransferBytes) return false
            val expected = destination.files.getOrNull(destination.next) ?: return false
            if (expected.name != rawName || expected.size != size) return false
            val segments = pathSegments(rawName) ?: return false
            val displayName = segments.last()
            val target = if (destination.tree != null) createSafFile(destination, segments) else createMediaStoreFile(destination, segments)
            val output = activity.contentResolver.openOutputStream(target.first, "w") ?: run { activity.contentResolver.delete(target.first, null, null); return false }
            destination.next++
            openFiles[tid] = OpenReceive(tid, rawName, size, 0, target.first, output, target.second, displayName)
            true
        } catch (error: Exception) {
            emit("save-error", JSONObject().put("tid", tid).put("message", error.message ?: "Could not create the received file"))
            false
        }
    }

    fun saveChunk(tid: String, base64: String) {
        try {
            if (base64.length > 350000) throw IllegalArgumentException("File chunk is too large")
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            if (bytes.isEmpty() || bytes.size > 256 * 1024) throw IllegalArgumentException("Invalid file chunk")
            synchronized(writerLock) {
                val file = openFiles[tid] ?: throw IllegalStateException("No approved file is open")
                if (file.written > file.size - bytes.size) throw IllegalStateException("Received more data than expected")
                file.output.write(bytes); file.written += bytes.size
            }
            emit("save-wrote", JSONObject().put("tid", tid).put("n", bytes.size))
        } catch (error: Exception) {
            emit("save-error", JSONObject().put("tid", tid).put("message", error.message ?: "Could not save the received file"))
        }
    }

    fun saveClose(tid: String) {
        val file = synchronized(writerLock) { openFiles.remove(tid) } ?: return
        try {
            file.output.flush(); file.output.close()
            if (file.written != file.size) throw IllegalStateException("Received file was incomplete")
            if (file.pendingMediaStore) activity.contentResolver.update(file.uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
            emit("saved", JSONObject().put("tid", tid).put("name", file.displayName).put("path", file.uri.toString()))
        } catch (error: Exception) {
            deletePartial(file)
            emit("save-error", JSONObject().put("tid", tid).put("message", error.message ?: "Could not finish saving the file"))
        }
    }

    fun saveAbort(tid: String) {
        val file = synchronized(writerLock) { openFiles.remove(tid) } ?: return
        try { file.output.close() } catch (_: Exception) { }
        deletePartial(file)
    }

    private fun deletePartial(file: OpenReceive) {
        try { activity.contentResolver.delete(file.uri, null, null) } catch (_: Exception) { }
    }

    fun finishReceive(tid: String) {
        if (synchronized(writerLock) { openFiles.containsKey(tid) }) saveAbort(tid)
        synchronized(writerLock) { prepared.remove(tid); pendingReceive.remove(tid); pendingFiles.remove(tid); prepareCount = prepared.size + pendingReceive.size }
    }

    private fun createMediaStoreFile(destination: PreparedReceive, segments: List<String>): Pair<Uri, Boolean> {
        val rel = (destination.mediaRelativeRoot ?: "Download/Droply") + if (segments.size > 1) "/" + segments.dropLast(1).joinToString("/") else ""
        val relative = rel.trimEnd('/') + "/"
        val display = uniqueMediaName(relative, segments.last())
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, display)
            put(MediaStore.Downloads.MIME_TYPE, mimeType(display))
            put(MediaStore.Downloads.RELATIVE_PATH, relative)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = activity.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IllegalStateException("Could not create a file in Downloads")
        return uri to true
    }

    private fun createSafFile(destination: PreparedReceive, segments: List<String>): Pair<Uri, Boolean> {
        var directory = destination.root ?: throw IllegalStateException("Choose a save folder first")
        for (segment in segments.dropLast(1)) {
            val found = directory.findFile(segment)
            directory = when {
                found == null -> directory.createDirectory(segment) ?: throw IllegalStateException("Could not create a transfer folder")
                found.isDirectory -> found
                else -> throw IllegalStateException("A file conflicts with a folder name")
            }
        }
        val display = uniqueSafName(directory, segments.last())
        val created = directory.createFile(mimeType(display), display) ?: throw IllegalStateException("Could not create the received file")
        return created.uri to false
    }

    private fun uniqueSafName(directory: DocumentFile, value: String): String {
        val taken = directory.listFiles().mapNotNull { it.name }.toHashSet()
        return uniqueName(value, taken::contains)
    }

    private fun uniqueMediaName(relative: String, value: String): String {
        val taken = mutableSetOf<String>()
        activity.contentResolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, arrayOf(MediaStore.Downloads.DISPLAY_NAME),
            "${MediaStore.Downloads.RELATIVE_PATH}=?", arrayOf(relative), null)?.use { cursor ->
            val index = cursor.getColumnIndex(MediaStore.Downloads.DISPLAY_NAME)
            while (index >= 0 && cursor.moveToNext()) taken += cursor.getString(index)
        }
        return uniqueName(value, taken::contains)
    }

    private fun uniqueName(value: String, exists: (String) -> Boolean): String {
        if (!exists(value)) return value
        val dot = value.lastIndexOf('.'); val base = if (dot > 0) value.substring(0, dot) else value
        val ext = if (dot > 0) value.substring(dot) else ""
        for (index in 1..999) { val name = "$base ($index)$ext"; if (!exists(name)) return name }
        throw IllegalStateException("No unused file name is available")
    }

    private fun uniqueDirectory(parent: DocumentFile, desired: String): DocumentFile? {
        if (parent.findFile(desired) == null) return parent.createDirectory(desired)
        for (i in 1..999) { val name = "$desired ($i)"; if (parent.findFile(name) == null) return parent.createDirectory(name) }
        return null
    }

    private fun uniqueMediaDirectory(parent: String, desired: String): String {
        var name = desired; var i = 0
        while (mediaPathExists("$parent/$name")) { i++; name = "$desired ($i)"; if (i >= 999) throw IllegalStateException("No unused transfer folder is available") }
        return "$parent/$name"
    }

    private fun mediaPathExists(path: String): Boolean {
        val relative = path.trimEnd('/') + "/"
        return activity.contentResolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, arrayOf(MediaStore.Downloads._ID),
            "${MediaStore.Downloads.RELATIVE_PATH}=?", arrayOf(relative), null)?.use { it.moveToFirst() } ?: false
    }

    private fun validRelativeName(name: String): Boolean = pathSegments(name) != null

    private fun pathSegments(raw: String): List<String>? {
        if (raw.isBlank() || raw.length > 1024 || raw.startsWith('/') || raw.contains('\\')) return null
        val segments = raw.split('/')
        if (segments.isEmpty() || segments.size > 32 || segments.any { it.isEmpty() || it == "." || it == ".." }) return null
        return segments.map(::safeSegment)
    }

    private fun safeSegment(raw: String): String {
        var value = raw.replace(Regex("[<>:\"|?*\\u0000-\\u001F]"), "_").trim().trimEnd('.', ' ')
        if (value.isBlank() || value == "." || value == "..") value = "file"
        if (value.matches(Regex("(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\..*)?"))) value = "_$value"
        if (value.length > 200) { val dot = value.lastIndexOf('.'); val ext = if (dot > 0) value.substring(dot).take(20) else ""; value = value.take(200 - ext.length) + ext }
        return value
    }

    private fun mimeType(name: String): String = android.webkit.MimeTypeMap.getSingleton()
        .getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase()) ?: "application/octet-stream"

}

