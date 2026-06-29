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
const debugCanvas = document.querySelector("#debugCanvas");
const debugPanel = document.querySelector("#debugPanel");
const debugContext = debugCanvas.getContext("2d");
const params = new URLSearchParams(location.search);
const debugMode = params.has("debug");

if (debugMode) {
  stage.classList.add("debug");
}

let landmarker;
let startedAt = 0;
let blowStartedAt = 0;
let done = false;
let lastVideoTime = -1;

const BLOW_READY_DELAY = 5200;
const BLOW_HOLD_MS = 1500;

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

  if (!done) {
    requestAnimationFrame(track);
  }
}

function updateFace(result, now) {
  const landmarks = result.faceLandmarks?.[0];
  if (!landmarks) {
    hat.classList.remove("visible");
    updateDebug(null);
    setStatus("ขยับหน้าให้อยู่กลางกล้อง");
    blowStartedAt = 0;
    return;
  }

  placeHat(landmarks);

  if (now - startedAt < BLOW_READY_DELAY) {
    updateDebug(result, false);
    setStatus("รอเค้กเข้าที่ก่อน...");
    return;
  }

  const blowing = isBlowing(result.faceBlendshapes?.[0]?.categories || [], landmarks);
  updateDebug(result, blowing);
  if (!blowing) {
    blowStartedAt = 0;
    setStatus("เป่าเทียนด้วยปาก");
    return;
  }

  blowStartedAt ||= now;
  setStatus("ดีมาก เป่าค้างไว้อีกนิด...");
  if (now - blowStartedAt > BLOW_HOLD_MS) {
    finish();
  }
}

function placeHat(landmarks) {
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const faceWidth = Math.abs(rightEye.x - leftEye.x) * innerWidth;
  const hatWidth = Math.max(86, Math.min(150, faceWidth * 0.72));
  const hatHeight = Math.max(100, Math.min(168, faceWidth * 0.82));
  const x = (1 - (leftEye.x + rightEye.x) / 2) * innerWidth;
  const y = ((leftEye.y + rightEye.y) / 2) * innerHeight - hatHeight * 1.2;

  hat.classList.add("visible");
  hat.style.width = `${hatWidth}px`;
  hat.style.height = `${hatHeight}px`;
  hat.style.transform = `translate(${x - hatWidth / 2}px, ${y}px)`;
}

function isBlowing(categories, landmarks) {
  const blend = Object.fromEntries(categories.map((item) => [item.categoryName, item.score]));
  const mouthOpen = (blend.jawOpen || 0) > 0.32 || mouthOpenRatio(landmarks) > 0.11;
  const pursed = (blend.mouthPucker || 0) > 0.65 || (blend.mouthFunnel || 0) > 0.65;

  return mouthOpen && pursed;
}

function mouthOpenRatio(landmarks) {
  return distance(landmarks[13], landmarks[14]) / distance(landmarks[33], landmarks[263]);
}

function mouthWidthRatio(landmarks) {
  return distance(landmarks[61], landmarks[291]) / distance(landmarks[33], landmarks[263]);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function finish() {
  done = true;
  stage.classList.add("done");
  setStatus("สุขสันต์วันเกิด!");
  playBirthdaySong(false);
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
    ["mouthTop", 13, "#fb7185"],
    ["mouthBottom", 14, "#fb7185"],
    ["mouthLeft", 61, "#a78bfa"],
    ["mouthRight", 291, "#a78bfa"],
  ];

  for (const [label, index, color] of points) {
    drawPoint(label, landmarks[index], color);
  }

  drawBox(hat.getBoundingClientRect(), "#22c55e", "hat");
  drawBox(document.querySelector("#cake").getBoundingClientRect(), "#f97316", "cake");

  debugPanel.textContent = [
    `blowing: ${blowing}`,
    `jawOpen: ${round(blend.jawOpen)}`,
    `pucker: ${round(blend.mouthPucker)}`,
    `funnel: ${round(blend.mouthFunnel)}`,
    `openRatio: ${round(mouthOpenRatio(landmarks))}`,
    `widthRatio: ${round(mouthWidthRatio(landmarks))}`,
    `hat: ${Math.round(hat.getBoundingClientRect().left)},${Math.round(hat.getBoundingClientRect().top)}`,
  ].join("\n");
}

function drawPoint(label, point, color) {
  const x = (1 - point.x) * innerWidth;
  const y = point.y * innerHeight;
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
  points[13] = { x: 0.5, y: 0.55 };
  points[14] = { x: 0.5, y: 0.63 };
  points[61] = { x: 0.41, y: 0.58 };
  points[291] = { x: 0.59, y: 0.58 };

  console.assert(isBlowing([{ categoryName: "mouthPucker", score: 0.8 }], points), "detects a blow face");
  points[291] = { x: 0.72, y: 0.58 };
  console.assert(!isBlowing([], points), "ignores a normal open mouth");
}

if (params.has("selfcheck")) {
  runSelfCheck();
}
