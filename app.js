import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";

const stage = document.querySelector(".stage");
const video = document.querySelector("#camera");
const startButton = document.querySelector("#startButton");
const statusText = document.querySelector("#status");
const hat = document.querySelector("#hat");
const birthdaySong = document.querySelector("#birthdaySong");
const confettiLayer = document.querySelector("#confettiLayer");
const debugCanvas = document.querySelector("#debugCanvas");
const debugPanel = document.querySelector("#debugPanel");
const debugContext = debugCanvas.getContext("2d");
const params = new URLSearchParams(location.search);
const debugMode = !params.has("nodebug");
const tuningMode = params.has("tune");

if (debugMode) {
  stage.classList.add("debug");
}

let landmarker;
let startedAt = 0;
let blowStartedAt = 0;
let done = false;
let lastVideoTime = -1;

const BLOW_READY_DELAY = 5200;
const BLOW_HOLD_MS = 2500;
const MOUTH_TOP = 0;
const MOUTH_BOTTOM = 17;
const MOUTH_LEFT = 61;
const MOUTH_RIGHT = 291;

startButton.addEventListener("click", start);

async function start() {
  startButton.disabled = true;
  setStatus("กำลังเปิดกล้อง...");

  try {
    await unlockSong();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 1280, height: 720 },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    landmarker = await createLandmarker();
    stage.classList.add("started", "party");
    startedAt = performance.now();
    setStatus("เค้กกำลังมา...");
    setTimeout(() => {
      setStatus("จัดปากเหมือนกำลังเป่าเทียน");
      playBirthdaySong(true);
    }, 1600);
    requestAnimationFrame(track);
  } catch (error) {
    startButton.disabled = false;
    setStatus(error.message || "เปิดกล้องไม่ได้ ลองอนุญาตกล้องแล้วรีเฟรชหน้า");
  }
}

async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
  );

  const options = {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  };

  try {
    return await FaceLandmarker.createFromOptions(vision, options);
  } catch {
    options.baseOptions.delegate = "CPU";
    return FaceLandmarker.createFromOptions(vision, options);
  }
}

function track(now) {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    updateFace(result, now);
  }

  requestAnimationFrame(track);
}

function updateFace(result, now) {
  const landmarks = result.faceLandmarks?.[0];
  if (!landmarks) {
    hat.classList.remove("visible");
    updateDebug(null);
    if (!done) setStatus("ขยับหน้าให้อยู่กลางกล้อง");
    blowStartedAt = 0;
    return;
  }

  placeHat(landmarks);

  if (done) {
    updateDebug(result, false);
    return;
  }

  if (now - startedAt < BLOW_READY_DELAY) {
    updateDebug(result, false);
    setStatus("รอเค้กเข้าที่ก่อน...");
    return;
  }

  const blowing = isBlowing(result.faceBlendshapes?.[0]?.categories || [], landmarks);
  updateDebug(result, blowing);
  if (!blowing || tuningMode) {
    blowStartedAt = 0;
    setStatus(tuningMode ? "โหมดจูน: ยังไม่จบอัตโนมัติ" : "เป่าเทียนด้วยปาก");
    return;
  }

  blowStartedAt ||= now;
  setStatus("ดีมาก เป่าค้างไว้อีกนิด...");
  if (now - blowStartedAt > BLOW_HOLD_MS) {
    finish();
  }
}

function placeHat(landmarks) {
  const head = landmarks[10];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const headPoint = toScreenPoint(head);
  const leftEyePoint = toScreenPoint(leftEye);
  const rightEyePoint = toScreenPoint(rightEye);
  const faceWidth = Math.abs(rightEyePoint.x - leftEyePoint.x);
  const hatWidth = Math.max(110, Math.min(190, faceWidth * 0.9));
  const hatHeight = Math.max(140, Math.min(235, faceWidth * 1.18));
  const x = clamp(headPoint.x, hatWidth / 2, innerWidth - hatWidth / 2);
  const y = clamp(headPoint.y + 16, hatHeight, innerHeight - 8);

  hat.classList.add("visible");
  hat.style.width = `${hatWidth}px`;
  hat.style.height = `${hatHeight}px`;
  hat.style.left = `${x}px`;
  hat.style.top = `${y}px`;
  hat.style.transform = "translate(-50%, -100%) rotate(12deg)";
}

function isBlowing(categories, landmarks) {
  const blend = Object.fromEntries(categories.map((item) => [item.categoryName, item.score]));
  const pursed = (blend.mouthPucker || 0) > 0.55 || (blend.mouthFunnel || 0) > 0.55;
  const lipsNarrow = mouthWidthRatio(landmarks) < 0.42;

  return pursed && lipsNarrow;
}

function mouthOpenRatio(landmarks) {
  return distance(landmarks[MOUTH_TOP], landmarks[MOUTH_BOTTOM]) / distance(landmarks[33], landmarks[263]);
}

function mouthWidthRatio(landmarks) {
  return distance(landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT]) / distance(landmarks[33], landmarks[263]);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toScreenPoint(point) {
  const videoWidth = video.videoWidth || innerWidth;
  const videoHeight = video.videoHeight || innerHeight;
  const scale = Math.max(innerWidth / videoWidth, innerHeight / videoHeight);
  const drawnWidth = videoWidth * scale;
  const drawnHeight = videoHeight * scale;
  const offsetX = (innerWidth - drawnWidth) / 2;
  const offsetY = (innerHeight - drawnHeight) / 2;

  return {
    x: offsetX + (1 - point.x) * drawnWidth,
    y: offsetY + point.y * drawnHeight,
  };
}

function finish() {
  done = true;
  stage.classList.add("done");
  setStatus("สุขสันต์วันเกิด!");
  throwConfetti();
  playBirthdaySong(false);
}

function throwConfetti() {
  confettiLayer.textContent = "";
  const colors = ["#f43f5e", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#fb923c", "#fff7ed"];

  for (let index = 0; index < 120; index += 1) {
    const piece = document.createElement("i");
    piece.style.setProperty("--x", `${Math.random() * 100}vw`);
    piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 42}vw`);
    piece.style.setProperty("--spin", `${Math.random() * 900 - 450}deg`);
    piece.style.setProperty("--delay", `${Math.random() * 0.7}s`);
    piece.style.setProperty("--fall", `${2.4 + Math.random() * 2.2}s`);
    piece.style.background = colors[index % colors.length];
    piece.className = Math.random() > 0.55 ? "streamer" : "";
    confettiLayer.append(piece);
  }

  setTimeout(() => {
    confettiLayer.textContent = "";
  }, 5200);
}

async function unlockSong() {
  birthdaySong.volume = 0.8;
  birthdaySong.muted = true;
  try {
    await birthdaySong.play();
    birthdaySong.pause();
    birthdaySong.currentTime = 0;
  } catch {
    // ponytail: Safari may still block; the later play() is the real attempt.
  }
  birthdaySong.muted = false;
}

function playBirthdaySong(restart) {
  if (restart) {
    birthdaySong.currentTime = 0;
  }
  birthdaySong.play().catch(() => setStatus("แตะหน้าจออีกครั้งเพื่อเปิดเสียง"));
}

function setStatus(message) {
  statusText.textContent = message;
}

function updateDebug(result, blowing = false) {
  if (!debugMode) return;

  debugCanvas.width = innerWidth * devicePixelRatio;
  debugCanvas.height = innerHeight * devicePixelRatio;
  debugContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  debugContext.clearRect(0, 0, innerWidth, innerHeight);

  const landmarks = result?.faceLandmarks?.[0];
  if (!landmarks) {
    debugPanel.textContent = "face: none";
    return;
  }

  const blend = Object.fromEntries((result.faceBlendshapes?.[0]?.categories || []).map((item) => [item.categoryName, item.score]));
  const points = [
    ["head", 10, "#facc15"],
    ["leftEye", 33, "#38bdf8"],
    ["rightEye", 263, "#38bdf8"],
    ["mouthTop", MOUTH_TOP, "#fb7185"],
    ["mouthBottom", MOUTH_BOTTOM, "#fb7185"],
    ["mouthLeft", MOUTH_LEFT, "#a78bfa"],
    ["mouthRight", MOUTH_RIGHT, "#a78bfa"],
  ];

  for (const [label, index, color] of points) {
    drawPoint(label, landmarks[index], color);
  }

  const headPoint = toScreenPoint(landmarks[10]);
  drawBox(hat.getBoundingClientRect(), "#22c55e", "hat");
  drawBox(document.querySelector("#cake").getBoundingClientRect(), "#f97316", "cake");

  debugPanel.textContent = [
    `blowing: ${blowing}`,
    `tuning: ${tuningMode}`,
    `ready: ${Math.max(0, ((performance.now() - startedAt) / 1000).toFixed(1))}s / ${(BLOW_READY_DELAY / 1000).toFixed(1)}s`,
    `hold: ${blowStartedAt ? ((performance.now() - blowStartedAt) / 1000).toFixed(1) : "0.0"}s / ${(BLOW_HOLD_MS / 1000).toFixed(1)}s`,
    `jawOpen: ${round(blend.jawOpen)}`,
    `pucker: ${round(blend.mouthPucker)}`,
    `funnel: ${round(blend.mouthFunnel)}`,
    `openRatio: ${round(mouthOpenRatio(landmarks))}`,
    `widthRatio: ${round(mouthWidthRatio(landmarks))}`,
    `head: ${Math.round(headPoint.x)},${Math.round(headPoint.y)}`,
    `hat: ${Math.round(hat.getBoundingClientRect().left)},${Math.round(hat.getBoundingClientRect().top)}`,
  ].join("\n");
}

function drawPoint(label, point, color) {
  const { x, y } = toScreenPoint(point);
  debugContext.fillStyle = color;
  debugContext.beginPath();
  debugContext.arc(x, y, 7, 0, Math.PI * 2);
  debugContext.fill();
  debugContext.fillText(label, x + 8, y - 8);
}

function drawBox(rect, color, label) {
  debugContext.strokeStyle = color;
  debugContext.lineWidth = 3;
  debugContext.strokeRect(rect.left, rect.top, rect.width, rect.height);
  debugContext.fillStyle = color;
  debugContext.fillText(label, rect.left + 6, rect.top + 16);
}

function round(value = 0) {
  return value.toFixed(3);
}

function runSelfCheck() {
  const points = Array.from({ length: 300 }, () => ({ x: 0, y: 0 }));
  points[33] = { x: 0.2, y: 0.4 };
  points[263] = { x: 0.8, y: 0.4 };
  points[MOUTH_TOP] = { x: 0.5, y: 0.55 };
  points[MOUTH_BOTTOM] = { x: 0.5, y: 0.65 };
  points[MOUTH_LEFT] = { x: 0.41, y: 0.58 };
  points[MOUTH_RIGHT] = { x: 0.59, y: 0.58 };

  console.assert(isBlowing([{ categoryName: "jawOpen", score: 0.6 }, { categoryName: "mouthPucker", score: 0.9 }], points), "detects a blow face");
  points[291] = { x: 0.72, y: 0.58 };
  console.assert(!isBlowing([], points), "ignores a normal open mouth");
  const mapped = toScreenPoint({ x: 0.5, y: 0.5 });
  console.assert(Number.isFinite(mapped.x) && Number.isFinite(mapped.y), "maps landmarks to screen");
}

if (params.has("selfcheck")) {
  runSelfCheck();
}
