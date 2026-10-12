<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, maximum-scale=1.0, initial-scale=1.0, user-scalable=no">
    <title>Cup Heroes</title>
    <style>
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #000;
        }
        #gameContainer {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
        }
        #unity-canvas {
            width: 100%;
            height: 100%;
            display: block;
            background: #000;
        }
        #ziggyLoader {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            color: white;
            font-family: Arial, sans-serif;
            background: linear-gradient(180deg, #05080c, #102331, #263b4a);
        }
        #loadingText {
            margin-top: 18px;
            opacity: 0.8;
        }
        #progressBar {
            width: min(400px, 80vw);
            height: 8px;
            margin-top: 15px;
            background: rgba(255,255,255,.15);
            border-radius: 10px;
            overflow: hidden;
        }
        #progressFill {
            width: 0%;
            height: 100%;
            background: white;
            transition: width .15s ease;
        }
    </style>

    <script>
        window.czyVariables = {
            countryCode: "US"
        };
    </script>
</head>

<body>

<div id="ziggyLoader">
    <div style="font-size:40px">❄</div>
    <div id="loadingText">Preparing Cup Heroes…</div>
    <div id="progressBar">
        <div id="progressFill"></div>
    </div>
</div>

<div id="gameContainer">
    <canvas id="unity-canvas"></canvas>
</div>

<!-- CrazyGames SDK v3, loaded from ./ -->
<script src="./crazygames-sdk-v3.js"></script>

<!--
    Optional: if your build emits the SDK under a different name, use:
    <script src="./crazygames-sdk-v3.8.0.js"></script>
    or
    <script src="./Build/crazygames-sdk-v3.js"></script>
-->

<script>
// Initialize CrazyGames SDK v3 if it was loaded successfully.
// The SDK exposes window.CrazyGames.SDK
(function () {
    if (window.CrazyGames && window.CrazyGames.SDK) {
        window.CrazyGames.SDK.init()
            .then(() => {
                console.log("[CrazyGames SDK] Initialized from ./crazygames-sdk-v3.js");
            })
            .catch((err) => {
                console.warn("[CrazyGames SDK] Init failed:", err);
            });
    } else {
        console.warn("[CrazyGames SDK] Not found at ./crazygames-sdk-v3.js — running without it.");
    }
})();
</script>

<script>
const BUILD = "./Build/";

const LOADER = BUILD + "cup_heroes_CG_v1.3.loader.js";
const FRAMEWORK = BUILD + "cup_heroes_CG_v1.3.framework.js.br";
const DATA_PATH = BUILD + "cup_heroes_CG_v1.3.data.br";
const WASM_PATH = BUILD + "cup_heroes_CG_v1.3.wasm.br";

const WASM_MIME = "application/wasm";
const DATA_MIME = "application/octet-stream";

function setStatus(text, percent) {
    const loadingText = document.getElementById("loadingText");
    const progressFill = document.getElementById("progressFill");
    if (loadingText) loadingText.textContent = text;
    if (progressFill && typeof percent === "number") {
        progressFill.style.width = Math.max(0, Math.min(100, percent)) + "%";
    }
}

async function mergeFiles(fileParts, cacheKey, mime) {
    const cache = await caches.open("cup-heroes-cache");
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        console.log("[Cache] Hit:", cacheKey);
        const blob = await cachedResponse.blob();
        return URL.createObjectURL(blob);
    }

    console.log("[Cache] Miss, fetching:", fileParts);
    const buffers = await Promise.all(
        fileParts.map(part => fetch(part).then(r => {
            if (!r.ok) throw new Error("Failed to fetch " + part);
            return r.arrayBuffer();
        }))
    );

    const mergedBlob = new Blob(buffers, { type: mime });
    await cache.put(cacheKey, new Response(mergedBlob));
    return URL.createObjectURL(mergedBlob);
}

function getParts(file, start, end) {
    let parts = [];
    for (let i = start; i <= end; i++) {
        parts.push(file + ".part" + i);
    }
    return parts;
}

function loadUnityLoader() {
    return new Promise(function (resolve, reject) {
        if (typeof createUnityInstance === "function") {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.src = LOADER;
        script.onload = function () {
            console.log("Cup Heroes Unity loader loaded.");
            resolve();
        };
        script.onerror = function () {
            reject(new Error("Unity loader failed to load: " + LOADER));
        };
        document.head.appendChild(script);
    });
}

async function loadGame() {
    try {
        setStatus("Downloading game files…", 0);

        const [wasmURL, dataURL] = await Promise.all([
            mergeFiles(getParts(WASM_PATH, 0, 1), WASM_PATH, WASM_MIME),
            mergeFiles(getParts(DATA_PATH, 0, 1), DATA_PATH, DATA_MIME)
        ]);

        setStatus("Loading Unity…", 85);
        await loadUnityLoader();
        setStatus("Starting Cup Heroes…", 90);

        const unityConfig = {
            loaderUrl: LOADER,
            dataUrl: dataURL,
            frameworkUrl: FRAMEWORK,
            codeUrl: wasmURL,
            streamingAssetsUrl: "StreamingAssets",
            companyName: "Cup Heroes",
            productName: "Cup Heroes",
            productVersion: "1.3",
            showBanner: false
        };

        console.log("[Unity] Config:", unityConfig);

        const instance = await createUnityInstance(
            document.getElementById("unity-canvas"),
            unityConfig,
            function (progress) {
                const percent = 90 + Math.round(progress * 10);
                setStatus("Starting game " + Math.round(progress * 100) + "%…", percent);
            }
        );

        window.gameInstance = instance;

        // Expose a SendMessage bridge that delegates to the SDK if needed
        window.unityInstance = {
            SendMessage: function (objectName, methodName, parameter) {
                try {
                    instance.SendMessage(objectName, methodName, parameter);
                } catch (e) {
                    console.warn("[Bridge] Unity SendMessage failed:", e);
                }
            }
        };

        console.log("Cup Heroes started successfully.");
        setStatus("Game loaded!", 100);

        setTimeout(function () {
            const loader = document.getElementById("ziggyLoader");
            if (loader) loader.remove();
        }, 300);

    } catch (err) {
        console.error("Failed to load Cup Heroes:", err);
        setStatus("Failed to load Cup Heroes: " + err.message, 0);
    }
}

loadGame();
</script>

</body>
</html>