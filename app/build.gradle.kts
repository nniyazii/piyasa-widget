plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.piyasa.widget"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.piyasa.widget"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.4.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Kişisel kullanım / sideload için debug anahtarıyla imzalanır.
            // Play Store'a çıkarken kendi keystore'unuzu tanımlayın.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            // ./gradlew testDebugUnitTest -Ppreviews=true  -> app/build/widget-previews/*.png
            it.systemProperty("previews", project.findProperty("previews")?.toString() ?: "false")
            it.systemProperty("previews.dir", layout.buildDirectory.dir("widget-previews").get().asFile.absolutePath)
            it.systemProperty("live", project.findProperty("live")?.toString() ?: "false")
            it.systemProperty("previews.debug", project.findProperty("previewsDebug")?.toString() ?: "false")
            it.testLogging.showStandardStreams = project.hasProperty("previewsDebug") || project.hasProperty("live")
            project.findProperty("robolectricRepo")?.let { url -> it.systemProperty("robolectric.dependency.repo.url", url.toString()) }
        }
    }
    lint {
        // Sürüm uyarıları ve önizleme düzenindeki örnek metinler bilinçli.
        disable += setOf("GradleDependency", "AndroidGradlePluginVersion", "NewerVersionAvailable", "HardcodedText", "SmallSp")
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.icons)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.datastore)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
}
