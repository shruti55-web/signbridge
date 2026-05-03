// ================= VARIABLES =================
const video = document.getElementById("camera");
const canvas = document.getElementById("landmarkCanvas");
const canvasCtx = canvas.getContext("2d");
const btn = document.getElementById("enableCamera");
const outputDiv = document.getElementById("output");

let stream = null;
let hands = null;
let cameraInstance = null;
let lastPrediction = "";
let sentence = "";

// ================= CAMERA BUTTON =================
btn.addEventListener("click", async () => {
  if (stream) {
    stopCamera();
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 }
    });

    video.srcObject = stream;
    await video.play();

    btn.textContent = "Stop Camera";

    initMediapipe();

  } catch (err) {
    alert("Camera access denied.");
    console.error(err);
  }
});

// ================= STOP CAMERA =================
function stopCamera() {
  if (!stream) return;

  stream.getTracks().forEach(track => track.stop());
  stream = null;

  btn.textContent = "Enable Camera";

  if (cameraInstance) {
    cameraInstance.stop();
    cameraInstance = null;
  }
}

// ================= MEDIAPIPE INIT =================
function initMediapipe() {

  hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
  });

  hands.onResults(onResults);

  cameraInstance = new Camera(video, {
    onFrame: async () => {
      if (hands) {
        await hands.send({ image: video });
      }
    },
    width: 640,
    height: 480
  });

  cameraInstance.start();
}

// ================= HANDLE RESULTS =================
async function onResults(results) {

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {

    const landmarks = results.multiHandLandmarks[0];

    // Draw landmarks
    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
      color: "#00FF00",
      lineWidth: 2
    });

    drawLandmarks(canvasCtx, landmarks, {
      color: "#FF0000",
      lineWidth: 1
    });

    // 14 landmarks used during training (14 × 3 = 42 features)
    const indices = [0,1,2,3,4,5,6,7,8,9,10,13,17,20];

    let landmarkArray = [];

    indices.forEach(i => {
      landmarkArray.push(landmarks[i].x);
      landmarkArray.push(landmarks[i].y);
      landmarkArray.push(landmarks[i].z);
    });

    if (landmarkArray.length !== 42) {
      console.error("Feature length mismatch:", landmarkArray.length);
      canvasCtx.restore();
      return;
    }

    try {

      const response = await fetch("http://127.0.0.1:5000/predict-sign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          landmarks: landmarkArray
        })
      });

      const data = await response.json();

      if (data.success) {

        const prediction = data.prediction;

        if (prediction !== lastPrediction) {
          lastPrediction = prediction;
          sentence += prediction;
        }

        outputDiv.innerText = "Detected: " + sentence;
      }

    } catch (err) {
      console.error("Backend error:", err);
    }

  } else {
    outputDiv.innerText = "Detected: ";
  }

  canvasCtx.restore();
}

// ================= CLEANUP =================
window.addEventListener("beforeunload", () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  if (cameraInstance) {
    cameraInstance.stop();
  }
});