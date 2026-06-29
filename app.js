import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";

const stage = document.querySelector(".stage");
const video = document.querySelector("#camera");
const startButton = document.querySelector("#startButton");
const statusText = document.querySelector("#status");
const hat = document.querySelector("#hat");

let landmarker;
let audio;
let startedAt = 0;
let blowStartedAt = 0;
let done = false;
let lastVideoTime = -1;

const noteMap = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392,
  A4: 440,
  C5: 523.25,
};

const song = [
  ["C4", 0.22],
  ["C4", 0.22],
  ["D4", 0.44],
  ["C4", 0.44],
  ["F4", 0.44],
  ["E4", 0.72],
  ["C4", 0.22],
  ["C4", 0.22],
  ["D4", 0.44],
  ["C4", 0.44],
  ["G4", 0.44],
  ["F4", 0.72],
  ["C4", 0.22],
  ["C4", 0.22],
  ["C5", 0.44],
  ["A4", 0.44],
  ["F4", 0.44],
  ["E4", 0.44],
  ["D4", 0.72],
];

startButton.addEventListener("click", start);

async function start() {
  startButton.disabled = true;
  setStatus("กำลังเปิดกล้อง...");

  try {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    audio = new AudioEngine();
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
      playSong();
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
    setStatus("ขยับหน้าให้อยู่กลางกล้อง");
    blowStartedAt = 0;
    return;
  }

  placeHat(landmarks);

  if (now - startedAt < 2600) {
    return;
  }

  const blowing = isBlowing(result.faceBlendshapes?.[0]?.categories || [], landmarks);
  if (!blowing) {
    blowStartedAt = 0;
    setStatus("เป่าเทียนด้วยปาก");
    return;
  }

  blowStartedAt ||= now;
  setStatus("ดีมาก เป่าค้างไว้อีกนิด...");
  if (now - blowStartedAt > 650) {
    finish();
  }
}

function placeHat(landmarks) {
  const brow = landmarks[10];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const faceWidth = Math.abs(rightEye.x - leftEye.x) * innerWidth;
  const hatWidth = Math.max(86, Math.min(150, faceWidth * 0.72));
  const hatHeight = Math.max(100, Math.min(168, faceWidth * 0.82));
  const x = brow.x * innerWidth;
  const y = brow.y * innerHeight - hatHeight * 0.62;
  const angle = Math.atan2(rightEye.y - leftEye.y, leftEye.x - rightEye.x) * (180 / Math.PI);

  hat.classList.add("visible");
  hat.style.width = `${hatWidth}px`;
  hat.style.height = `${hatHeight}px`;
  hat.style.transform = `translate(${x - hatWidth / 2}px, ${y}px) rotate(${angle}deg)`;
}

function isBlowing(categories, landmarks) {
  const blend = Object.fromEntries(categories.map((item) => [item.categoryName, item.score]));
  const mouthOpen = (blend.jawOpen || 0) > 0.14 || mouthOpenRatio(landmarks) > 0.055;
  const pursed =
    (blend.mouthPucker || 0) > 0.18 ||
    (blend.mouthFunnel || 0) > 0.18 ||
    mouthWidthRatio(landmarks) < 0.35;

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
  playSong(0.5);
}

function playSong(delay = 0) {
  if (!audio) return;

  let time = audio.currentTime + delay;
  for (const [note, length] of song) {
    playNote(noteMap[note], time, length);
    time += length;
  }
}

function playNote(frequency, time, length) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.16, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(time);
  oscillator.stop(time + length + 0.04);
}

function setStatus(message) {
  statusText.textContent = message;
}

function runSelfCheck() {
  const points = Array.from({ length: 300 }, () => ({ x: 0, y: 0 }));
  points[33] = { x: 0.2, y: 0.4 };
  points[263] = { x: 0.8, y: 0.4 };
  points[13] = { x: 0.5, y: 0.55 };
  points[14] = { x: 0.5, y: 0.6 };
  points[61] = { x: 0.41, y: 0.58 };
  points[291] = { x: 0.59, y: 0.58 };

  console.assert(isBlowing([{ categoryName: "mouthPucker", score: 0.25 }], points), "detects a blow face");
  points[291] = { x: 0.72, y: 0.58 };
  console.assert(!isBlowing([], points), "ignores a normal open mouth");
}

if (new URLSearchParams(location.search).has("selfcheck")) {
  runSelfCheck();
}
