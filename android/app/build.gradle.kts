plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// A side-by-side QR preview is safer than replacing a previously
// distributed debug APK: CI debug signing keys can differ, and uninstalling
// the existing APK would delete its locally protected device identity.
val qrSharingPreview = project.findProperty("droplyQrSharingPreview") == "true"
val droplyNewInstall = project.findProperty("droplyNewInstall") == "true"
val repoRoot = rootProject.projectDir.parentFile
val packageJson = groovy.json.JsonSlurper().parse(repoRoot.resolve("package.json")) as Map<*, *>
val droplyVersion = project.findProperty("droplyVersion")?.toString() ?: packageJson["version"].toString()
val versionParts = droplyVersion.substringBefore('-').split('.').map(String::toInt)
require(versionParts.size == 3 && versionParts.all { it in 0..999 }) { "DROPLY version must use major.minor.patch" }
val droplyVersionCode = versionParts[0] * 1_000_000 + versionParts[1] * 1_000 + versionParts[2]
val releaseKeystorePath = System.getenv("DROPLY_ANDROID_KEYSTORE")

android {
    namespace = "com.droply.android"
    compileSdk = 36

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    defaultConfig {
        applicationId = when {
            qrSharingPreview -> "com.droply.android.qrpreview"
            droplyNewInstall -> "com.droply.android.release"
            else -> "com.droply.android"
        }
        minSdk = 29
        targetSdk = 36
        versionCode = if (qrSharingPreview) 10 else if (droplyNewInstall) droplyVersionCode else 9
        versionName = if (qrSharingPreview) "2.8.15-qr-preview" else droplyVersion
        manifestPlaceholders["droplyAppLabel"] =
            when {
                qrSharingPreview -> "Droply QR Preview"
                droplyNewInstall -> "Droply (New)"
                else -> "Droply"
            }
    }

    signingConfigs {
        create("droplyRelease") {
            if (!releaseKeystorePath.isNullOrBlank()) {
                storeFile = file(releaseKeystorePath)
                storePassword = System.getenv("DROPLY_ANDROID_STORE_PASSWORD")
                keyAlias = System.getenv("DROPLY_ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("DROPLY_ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("droplyRelease")
        }
    }

    buildFeatures { buildConfig = true }

    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/droply-web"))
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:5.3.0")
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("androidx.core:core:1.13.1")
}

val webAssets = layout.buildDirectory.dir("generated/droply-web/www")
val prepareDroplyWeb by tasks.registering(Sync::class) {
    into(webAssets)
    from(repoRoot) {
        include("index.html", "settings.js", "settings.css")
    }
    from("src/main/web")
    from(repoRoot.resolve("assets")) { into("assets") }
    doLast {
        val page = webAssets.get().file("index.html").asFile
        val html = page.readText()
        val mobile = """
            <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
            <link rel="stylesheet" href="android.css">
            <script src="android-bridge.js"></script>
        """.trimIndent()
        check(html.contains("</head>")) { "Droply index.html has no head element" }
        page.writeText(html.replace("</head>", "$mobile\n</head>"))
        // Fail the APK build if QR UI or bundled libraries are missing.
        // This checks the exact files Gradle packages, not the web build.
        check(html.contains("id=\"copyFriendQr\"") && html.contains("id=\"saveFriendQr\"")) { "Missing Copy QR / Save QR UI" }
        check(html.contains("src=\"assets/friend-qr.js\"")) { "Missing friend QR script" }
        val assets = webAssets.get().asFile
        val required = listOf(
            "assets/friend-qr.js",
            "assets/vendor/qrcode.js",
            "assets/vendor/jsQR.js",
            "assets/vendor/qrcode-LICENSE",
            "assets/vendor/jsQR-LICENSE"
        )
        required.forEach { file ->
            check(assets.resolve(file).isFile) { "Missing APK QR asset: $file" }
        }
        check(assets.resolve("assets/friend-qr.js").readText()
            .contains("DroplyAndroid.copyQrImage(qr.dataUrl, qr.code)") &&
            assets.resolve("assets/friend-qr.js").readText().contains("DroplyAndroid.saveQrImage(qr.dataUrl, qr.code)")) {
            "Native Copy QR / Save QR actions are not wired up"
        }
    }
}

tasks.named("preBuild").configure { dependsOn(prepareDroplyWeb) }
