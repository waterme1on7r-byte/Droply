plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.droply.android"
    compileSdk = 36

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    defaultConfig {
        applicationId = "com.droply.android"
        minSdk = 29
        targetSdk = 36
        versionCode = 4
        versionName = "0.1.3"
    }

    buildFeatures { buildConfig = false }

    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/droply-web"))
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:5.3.0")
    implementation("androidx.documentfile:documentfile:1.0.1")
}

val repoRoot = rootProject.projectDir.parentFile
val webAssets = layout.buildDirectory.dir("generated/droply-web/www")
val prepareDroplyWeb by tasks.registering(Sync::class) {
    into(webAssets)
    from(repoRoot) {
        include("index.html", "settings.js", "settings.css")
    }
    from("src/main/web")
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
    }
}

tasks.named("preBuild").configure { dependsOn(prepareDroplyWeb) }
