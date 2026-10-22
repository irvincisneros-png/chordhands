// Camera + MediaPipe HandLandmarker. The vision bundle is imported lazily, only when the camera starts.
const BUNDLE = new URL("../vendor/mediapipe/vision_bundle.mjs", import.meta.url).href;
const WASM = new URL("../vendor/mediapipe/wasm", import.meta.url).href;
const MODEL = new URL("../vendor/models/hand_landmarker.task", import.meta.url).href;

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Turn a getUserMedia / model error into a friendly sentence. */
export function friendlyCameraError(err) {
  const n = err && err.name;
  if (!cameraSupported()) return "This browser can't use the camera here (it needs https:// or localhost). You can still play with the keyboard, mouse or touch.";
  if (n === "NotAllowedError" || n === "SecurityError") return "Camera permission was blocked. Allow the camera in the address bar, or just play with the pad and keys.";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "No camera was found. The chord pad and keyboard still work.";
  if (n === "NotReadableError" || n === "AbortError") return "The camera is busy in another app or tab. Close it and try again, or use the pad.";
  return "Hand tracking couldn't start (" + ((err && err.message) || n || "unknown error") + "). The pad and keyboard still work.";
}

export class HandCamera {
  constructor() {
    this.video = null;
    this.stream = null;
    this.landmarker = null;
    this.running = false;
    this.onFrame = null; // ({hands:[{label,score,landmarks}], t, aspect, fps})
    this.delegate = "";
    this._lastVideoTime = -1;
    this._fpsT = 0;
    this._fpsN = 0;
    this.fps = 0;
  }

  async start(video, onStatus = () => {}) {
    if (!cameraSupported()) throw Object.assign(new Error("unsupported"), { name: "NotSupported" });
    this.video = video;
    onStatus("Asking for camera…");
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 }, aspectRatio: { ideal: 16 / 9 }, facingMode: "user" }, audio: false });
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    onStatus("Loading hand model (first time takes a few seconds)…");
    try {
      await this._loadModel();
    } catch (e) {
      this.stop();
      throw e;
    }
    this.running = true;
    onStatus("");
    this._loop();
  }

  async _loadModel() {
    const { FilesetResolver, HandLandmarker } = await import(BUNDLE);
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await make("GPU");
      this.delegate = "GPU";
    } catch (e) {
      this.landmarker = await make("CPU");
      this.delegate = "CPU";
    }
  }

  _loop() {
    const v = this.video;
    const tick = () => {
      if (!this.running) return;
      if (v.readyState >= 2 && v.currentTime !== this._lastVideoTime) {
        this._lastVideoTime = v.currentTime;
        const now = performance.now();
        let res = null;
        try { res = this.landmarker.detectForVideo(v, now); } catch (e) { res = null; }
        const hands = [];
        if (res && res.landmarks) {
          res.landmarks.forEach((lm, i) => {
            const h = res.handedness && res.handedness[i] && res.handedness[i][0];
            hands.push({ landmarks: lm, label: h ? h.categoryName : "Left", score: h ? h.score : 1 });
          });
        }
        this._fpsN++;
        if (now - this._fpsT > 1000) { this.fps = this._fpsN; this._fpsN = 0; this._fpsT = now; }
        if (this.onFrame) this.onFrame({ hands, t: now, aspect: (v.videoWidth || 4) / (v.videoHeight || 3), fps: this.fps });
      }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
    };
    tick();
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    if (this.landmarker) { try { this.landmarker.close(); } catch {} }
    this.landmarker = null;
  }
}
