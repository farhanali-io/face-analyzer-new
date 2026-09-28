         
import * as faceapiNpm from '@vladmandic/face-api';

// Full Face Analyzer & Biometric Engine
let currentImageBase64 = null;
let currentAnalysisData = null;
let currentRealLandmarks = null;
let currentDetectionBox = null;
let currentImgDimensions = { width: 600, height: 750 };

let webcamStream = null;
let autoDetectTimer = null;
let alignedStreak = 0;
let countdownInterval = null;
let isCountingDown = false;

let modelsReady = false;
let modelsLoadError = null;

// Helper to access faceapi (CDN script in window or NPM module)
function getFaceApi() {
  if (typeof window !== 'undefined' && window.faceapi) {
    return window.faceapi;
  }
  if (faceapiNpm && faceapiNpm.nets) {
    return faceapiNpm;
  }
  if (faceapiNpm && faceapiNpm.default && faceapiNpm.default.nets) {
    return faceapiNpm.default;
  }
  return faceapiNpm;
}

// Model Loading with error tracking
export async function loadFaceModels() {
  const pill = document.getElementById('modelLoaderPill');
  const spinner = document.getElementById('modelLoaderSpinner');
  const text = document.getElementById('modelLoaderText');

  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
  try {
    const api = getFaceApi();
    if (!api || !api.nets) {
      throw new Error('faceapi library not initialized');
    }
    await api.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await api.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await api.nets.ageGenderNet.loadFromUri(MODEL_URL);
    modelsReady = true;
    modelsLoadError = null;
    console.log('[FaceAnalyzer] Models loaded successfully');

    if (pill && text) {
      text.textContent = '★ Biometric Engine Ready (On-Device)';
      pill.style.backgroundColor = 'var(--color-mint-pop)';
      if (spinner) spinner.style.display = 'none';
      setTimeout(() => {
        if (pill) pill.style.opacity = '0.85';
      }, 3000);
    }
    return true;
  } catch (err) {
    modelsLoadError = err;
    modelsReady = false;
    console.error('[FaceAnalyzer] Model load failed:', err);
    if (text) text.textContent = 'Face analysis engine unavailable. Please refresh the page.';
    if (pill) pill.style.backgroundColor = '#ffb3ba';
    if (spinner) spinner.style.display = 'none';
    return false;
  }
}

// Call this once on page load — but do NOT block the UI
loadFaceModels();

// Toast Utility
export function showToast(msg) {
  const toast = document.getElementById('siteToast');
  const toastMsg = document.getElementById('toastMsg');
  if (!toast || !toastMsg) return;
  toastMsg.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// Drawer Controls
export function openDrawer() {
  const drawer = document.getElementById('siteDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (drawer && overlay) {
    drawer.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

export function closeDrawer() {
  const drawer = document.getElementById('siteDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (drawer && overlay) {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Contact Modal Controls (if used)
export function openContactModal() {
  const modal = document.getElementById('contactModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

export function closeContactModal() {
  const modal = document.getElementById('contactModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

export function handleContactSubmit(e) {
  e.preventDefault();
  closeContactModal();
  showToast('Thanks for your note! Tool Genie research team has received it.');
}

// Input Mode Toggle (Upload vs Camera)
export function switchInputMode(mode) {
  const tabUpload = document.getElementById('tabUpload');
  const tabCamera = document.getElementById('tabCamera');
  const uploadCont = document.getElementById('uploadContainer');
  const cameraCont = document.getElementById('cameraContainer');
  hideClarityError();

  if (mode === 'upload') {
    tabUpload?.classList.add('active');
    tabCamera?.classList.remove('active');
    if (uploadCont) uploadCont.style.display = 'block';
    if (cameraCont) cameraCont.style.display = 'none';
    stopWebcam();
  } else {
    tabUpload?.classList.remove('active');
    tabCamera?.classList.add('active');
    if (uploadCont) uploadCont.style.display = 'none';
    if (cameraCont) cameraCont.style.display = 'block';

    if (!webcamStream) {
      const permPrompt = document.getElementById('cameraPermissionPrompt');
      const activeArea = document.getElementById('cameraActiveArea');
      if (permPrompt) permPrompt.style.display = 'block';
      if (activeArea) activeArea.style.display = 'none';
    } else {
      const permPrompt = document.getElementById('cameraPermissionPrompt');
      const activeArea = document.getElementById('cameraActiveArea');
      if (permPrompt) permPrompt.style.display = 'none';
      if (activeArea) activeArea.style.display = 'block';
    }
  }
}

// Live Camera
export async function requestCameraAccess() {
  const video = document.getElementById('webcamVideo');
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 720 },
        height: { ideal: 960 }
      },
      audio: false
    });
    if (video) {
      video.srcObject = webcamStream;
      video.onloadedmetadata = () => {
        const permPrompt = document.getElementById('cameraPermissionPrompt');
        const activeArea = document.getElementById('cameraActiveArea');
        if (permPrompt) permPrompt.style.display = 'none';
        if (activeArea) activeArea.style.display = 'block';
        startAutoDetection();
      };
    }
  } catch (err) {
    console.error('Camera access error:', err);
    showToast('Camera access unavailable. You can upload a photo or use demo portraits instead.');
    switchInputMode('upload');
  }
}

export function stopWebcam() {
  stopAutoDetection();
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  const video = document.getElementById('webcamVideo');
  if (video) video.srcObject = null;
  const pill = document.getElementById('cameraAlignmentPill');
  const statusText = document.getElementById('cameraStatusText');
  if (pill) pill.classList.remove('aligned');
  if (statusText) statusText.textContent = 'Align your face inside the grid';
  const badge = document.getElementById('cameraCountdownBadge');
  if (badge) badge.style.display = 'none';
  isCountingDown = false;
}

function startAutoDetection() {
  stopAutoDetection();
  alignedStreak = 0;
  isCountingDown = false;

  const offCanvas = document.createElement('canvas');
  offCanvas.width = 160;
  offCanvas.height = 213;
  const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
  const video = document.getElementById('webcamVideo');

  autoDetectTimer = setInterval(() => {
    if (!video || video.readyState < 2 || isCountingDown) return;

    try {
      offCtx.drawImage(video, 0, 0, 160, 213);
      const frame = offCtx.getImageData(0, 0, 160, 213);
      const data = frame.data;

      let totalLum = 0;
      let skinPixels = 0;
      let sampleCount = 0;

      for (let y = 50; y < 160; y += 4) {
        for (let x = 40; x < 120; x += 4) {
          const idx = (y * 160 + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          totalLum += lum;
          sampleCount++;

          if (r > 55 && g > 38 && b > 25 && r > g && r > b && Math.abs(r - g) > 12) {
            skinPixels++;
          }
        }
      }

      const avgLum = totalLum / Math.max(1, sampleCount);
      const skinRatio = skinPixels / Math.max(1, sampleCount);
      const pill = document.getElementById('cameraAlignmentPill');
      const statusText = document.getElementById('cameraStatusText');

      if (skinRatio >= 0.35 && avgLum >= 38 && avgLum <= 230) {
        alignedStreak++;
        if (alignedStreak >= 5) {
          pill?.classList.add('aligned');
          if (statusText) statusText.textContent = '★ Face Locked! Hold steady...';
          if (!isCountingDown) {
            startAutoCaptureCountdown();
          }
        } else {
          pill?.classList.add('aligned');
          if (statusText) statusText.textContent = '★ Face detected. Aligning...';
        }
      } else {
        alignedStreak = Math.max(0, alignedStreak - 1);
        if (!isCountingDown) {
          pill?.classList.remove('aligned');
          if (statusText) statusText.textContent = 'Align your face inside the grid';
        }
      }
    } catch (_) {}
  }, 180);
}

function stopAutoDetection() {
  if (autoDetectTimer) {
    clearInterval(autoDetectTimer);
    autoDetectTimer = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  isCountingDown = false;
  const badge = document.getElementById('cameraCountdownBadge');
  if (badge) badge.style.display = 'none';
}

function startAutoCaptureCountdown() {
  isCountingDown = true;
  let count = 3;
  const badge = document.getElementById('cameraCountdownBadge');
  const numEl = document.getElementById('countdownNumber');
  const statusText = document.getElementById('cameraStatusText');

  if (badge) badge.style.display = 'flex';
  if (numEl) numEl.textContent = count;
  if (statusText) statusText.textContent = `★ Auto-capturing in ${count}s...`;

  countdownInterval = setInterval(() => {
    count--;
    if (count > 0) {
      if (numEl) numEl.textContent = count;
      if (statusText) statusText.textContent = `★ Auto-capturing in ${count}s...`;
    } else {
      clearInterval(countdownInterval);
      countdownInterval = null;
      if (badge) badge.style.display = 'none';
      captureLiveSnapshot();
    }
  }, 700);
}

export function captureLiveSnapshot() {
  const video = document.getElementById('webcamVideo');
  if (!video || !video.videoWidth) {
    showToast('Camera is not ready yet. Please wait a moment.');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
  stopWebcam();
  runFullFaceAnalysis(dataUrl);
}

// Clarity Pre-validator (checks extreme blur, darkness, or glare)
function validateClientClarity(img) {
  const canvas = document.createElement('canvas');
  const w = Math.min(img.naturalWidth || 300, 320);
  const h = Math.min(img.naturalHeight || 400, 420);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const frame = ctx.getImageData(0, 0, w, h);
  const d = frame.data;
  const totalPixels = w * h;
  let totalLuminance = 0;

  for (let i = 0; i < d.length; i += 4) {
    totalLuminance += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  const avgLum = totalLuminance / totalPixels;

  if (avgLum < 18) {
    return {
      valid: false,
      error: 'The photo is too dark to accurately detect facial landmarks. Please upload a clear photo with front lighting.'
    };
  }
  if (avgLum > 250) {
    return {
      valid: false,
      error: 'The photo is heavily overexposed or washed out with glare. Please provide a photo with balanced exposure.'
    };
  }

  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 1; y < h - 1; y += 3) {
    for (let x = 1; x < w - 1; x += 3) {
      const idx = (y * w + x) * 4;
      const leftIdx = (y * w + (x - 1)) * 4;
      const rightIdx = (y * w + (x + 1)) * 4;
      const lumC = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
      const lumL = 0.299 * d[leftIdx] + 0.587 * d[leftIdx + 1] + 0.114 * d[leftIdx + 2];
      const lumR = 0.299 * d[rightIdx] + 0.587 * d[rightIdx + 1] + 0.114 * d[rightIdx + 2];
      const grad = Math.abs(lumR - lumC) + Math.abs(lumC - lumL);
      edgeSum += grad;
      edgeCount++;
    }
  }
  const avgEdge = edgeSum / Math.max(1, edgeCount);
  if (avgEdge < 5.5) {
    return {
      valid: false,
      error: 'The photo appears heavily blurry or out of focus. Please provide a sharp, clear portrait for clinical landmark mapping.'
    };
  }

  return { valid: true };
}

function showClarityError(msg) {
  // Hide only the scanning overlay and result dashboard
  document.getElementById('scanningOverlay')?.style.setProperty('display', 'none');
  document.getElementById('resultDashboard')?.style.setProperty('display', 'none');

  // KEEP the input area visible — do NOT touch analyzerInputArea
  const inputArea = document.getElementById('analyzerInputArea');
  if (inputArea) inputArea.style.display = 'block';

  // Show the error card ABOVE the input area
  const errorCard = document.getElementById('clarityErrorCard');
  const errorDesc = document.getElementById('clarityErrorDesc');
  if (errorDesc && msg) errorDesc.textContent = msg;
  if (errorCard) {
    errorCard.style.display = 'block';
    errorCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export function hideClarityError() {
  const errorCard = document.getElementById('clarityErrorCard');
  if (errorCard) errorCard.style.display = 'none';
}

export function retryScan() {
  hideClarityError();
  const inputArea = document.getElementById('analyzerInputArea');
  if (inputArea) inputArea.style.display = 'block';
  const resultDash = document.getElementById('resultDashboard');
  if (resultDash) resultDash.style.display = 'none';
  const scanOverlay = document.getElementById('scanningOverlay');
  if (scanOverlay) scanOverlay.style.display = 'none';
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';
  document.getElementById('analyzer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// File Reading & Drag & Drop
export function handleFileSelect(e) {
  if (e.target.files && e.target.files[0]) {
    readFile(e.target.files[0]);
  }
}

export function readFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please upload a valid image file (JPG, PNG, WEBP).');
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    runFullFaceAnalysis(event.target.result);
  };
  reader.readAsDataURL(file);
}

// Built-in Demo Portraits:
// Uses real photos saved in /samples/female.jpg and /samples/male.jpg
export function loadSample(type) {
  hideClarityError();
  const url = type === 'female' ? '/samples/female.jpg' : '/samples/male.jpg';
  runFullFaceAnalysis(url);
}

// -------------------------------------------------------------
// FIX 7 — BUILD RESULT FROM REAL LANDMARKS (Strictly zero random numbers)
// -------------------------------------------------------------
export function buildResultFromLandmarks(landmarks, realAge, realGender, detection) {
  const pts = landmarks; // Array of 68 {x, y} coordinates

  // 1. TOOL 1 — Facial Symmetry:
  // - Compare mirrored landmark pairs to the midline
  let sumX = 0;
  for (let i = 0; i < pts.length; i++) {
    sumX += pts[i].x;
  }
  const midlineX = sumX / pts.length;
  const faceWidth = Math.max(1, Math.abs(pts[16].x - pts[0].x));

  const symmetricPairs = [
    [0, 16], [1, 15], [2, 14], [3, 13], [4, 12], [5, 11], [6, 10], [7, 9], // jaw contour
    [17, 26], [18, 25], [19, 24], [20, 23], [21, 22], // eyebrows
    [36, 45], [37, 44], [38, 43], [39, 42], [40, 47], [41, 46], // eyes
    [31, 35], [32, 34], // nose wings
    [48, 54], [49, 53], [50, 52], [59, 55], [58, 56] // mouth
  ];

  let totalSymDiff = 0;
  for (const [l, r] of symmetricPairs) {
    const distL = Math.abs(pts[l].x - midlineX);
    const distR = Math.abs(pts[r].x - midlineX);
    totalSymDiff += Math.abs(distL - distR);
  }
  const avgSymDiff = totalSymDiff / symmetricPairs.length;
  const devPct = (avgSymDiff / faceWidth) * 100;
  const symScore = Math.max(10, Math.min(100, Math.round(100 - devPct)));

  // 2. TOOL 2 — Golden Ratio:
  // - Measure the three vertical thirds
  const boxY = detection?.box?.y ?? detection?.detection?.box?.y ?? Math.max(0, pts[19].y - (pts[8].y - pts[19].y) * 0.35);
  const hairlineY = Math.max(0, boxY);
  let sumBrowY = 0;
  for (let i = 19; i <= 24; i++) {
    sumBrowY += pts[i].y;
  }
  const browY = sumBrowY / 6;
  const subnasaleY = pts[33].y;
  const chinY = pts[8].y;

  const third1 = Math.max(1, browY - hairlineY);
  const third2 = Math.max(1, subnasaleY - browY);
  const third3 = Math.max(1, chinY - subnasaleY);
  const totalHeight = third1 + third2 + third3;

  const pct1 = (third1 / totalHeight) * 100;
  const pct2 = (third2 / totalHeight) * 100;
  const pct3 = (third3 / totalHeight) * 100;

  const varThirds = (Math.abs(pct1 - 33.33) + Math.abs(pct2 - 33.33) + Math.abs(pct3 - 33.33)) / 3;
  const phiScore = Math.max(10, Math.min(100, Math.round(100 - (varThirds * 3))));
  const thirdsRatioText = `${pct1.toFixed(0)}% / ${pct2.toFixed(0)}% / ${pct3.toFixed(0)}%`;

  // 3. TOOL 3 — Jawline:
  // - Gonial angle at landmarks 4 and 12
  function calcAngle(p1, pCenter, p2) {
    const v1x = p1.x - pCenter.x;
    const v1y = p1.y - pCenter.y;
    const v2x = p2.x - pCenter.x;
    const v2y = p2.y - pCenter.y;
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.hypot(v1x, v1y);
    const mag2 = Math.hypot(v2x, v2y);
    if (mag1 === 0 || mag2 === 0) return 120;
    const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cos) * (180 / Math.PI);
  }

  const leftGonial = calcAngle(pts[1], pts[4], pts[8]);
  const rightGonial = calcAngle(pts[15], pts[12], pts[8]);
  const avgGonialAngle = (leftGonial + rightGonial) / 2;
  const gonialDiff = Math.abs(avgGonialAngle - 120);
  const jawScore = Math.max(10, Math.min(100, Math.round(100 - (gonialDiff * 2.5))));

  // 4. TOOL 4 — Cheekbones:
  // - Width between landmarks 1 and 15
  const cheekboneWidth = Math.hypot(pts[15].x - pts[1].x, pts[15].y - pts[1].y);
  const jawWidth = Math.max(1, Math.hypot(pts[11].x - pts[5].x, pts[11].y - pts[5].y));
  const cheekJawRatio = cheekboneWidth / jawWidth;
  const ratioDiff = Math.abs(cheekJawRatio - 1.30);
  const cheekScore = Math.max(10, Math.min(100, Math.round(100 - (ratioDiff * 70))));

  // 5. TOOL 5 — Canthal Tilt:
  // - Angle between landmarks 36 and 39
  const dyLeft = pts[39].y - pts[36].y;
  const dxLeft = pts[39].x - pts[36].x;
  const leftTilt = Math.atan2(dyLeft, dxLeft) * (180 / Math.PI);

  const dyRight = pts[42].y - pts[45].y;
  const dxRight = pts[45].x - pts[42].x;
  const rightTilt = Math.atan2(dyRight, dxRight) * (180 / Math.PI);

  const avgTilt = (leftTilt + rightTilt) / 2;
  const canthalScore = Math.max(10, Math.min(100, Math.round(85 + (avgTilt * 3))));
  const tiltTypeLabel = avgTilt >= 0.5 ? 'Positive' : avgTilt <= -0.5 ? 'Negative' : 'Neutral';

  // 6. TOOL 6 — Biological Age:
  // - Use detection.age directly
  const ageVal = Math.max(1, Math.round(realAge));
  const confidenceRange = `${Math.max(1, ageVal - 4)}–${ageVal + 4} yrs`;
  const skinVitality = Math.max(10, Math.min(100, Math.round(100 - Math.max(0, ageVal - 18) * 1.5)));

  // Overall Attractiveness Score (Weighted harmonic synthesis)
  const overallScore = Math.max(10, Math.min(100, Math.round(
    symScore * 0.22 +
    phiScore * 0.22 +
    jawScore * 0.16 +
    cheekScore * 0.16 +
    canthalScore * 0.14 +
    (skinVitality * 0.10)
  )));

  const harmonyTier = overallScore >= 90
    ? 'Exceptional Facial Harmony'
    : overallScore >= 80
    ? 'Superior Classical Balance'
    : overallScore >= 70
    ? 'Harmonious Neoclassical Proportions'
    : 'Distinctive Natural Proportions';

  const strengths = [];
  if (symScore >= 80) strengths.push(`High bilateral symmetry with only ${devPct.toFixed(1)}% midline variance`);
  if (phiScore >= 80) strengths.push(`Balanced vertical thirds (${thirdsRatioText}) conforming to golden canons`);
  if (jawScore >= 80) strengths.push(`Sharp mandibular gonial angle (${avgGonialAngle.toFixed(1)}°) within 120° ideal aesthetic range`);
  if (cheekScore >= 80) strengths.push(`Prominent zygomatic arch with a ${cheekJawRatio.toFixed(2)}x cheekbone-to-jaw ratio (ideal 1.30x)`);
  if (canthalScore >= 80) strengths.push(`${tiltTypeLabel} canthal tilt (${avgTilt >= 0 ? '+' : ''}${avgTilt.toFixed(1)}°) projecting alert ocular presence`);
  if (strengths.length < 3) {
    strengths.push(`Identified as ${realGender || 'human'} biological profile with natural anatomical landmarks`);
    strengths.push(`Skin vitality scored at ${skinVitality}/100 based on biological profile`);
  }

  const recommendations = [
    'Maintain optimal hydration and facial posture to reinforce mandibular sharpness',
    'Neutral direct portrait lighting accentuates bizygomatic projection and vertical third harmony'
  ];

  return {
    attractivenessScore: overallScore,
    harmonyTier,
    summary: `Biometric scan calculated an overall harmony score of ${overallScore}/100. Measures ${devPct.toFixed(1)}% bilateral midline deviation, ${avgGonialAngle.toFixed(1)}° mandibular gonial angle (ideal 120°), ${cheekJawRatio.toFixed(2)}x cheekbone-to-jaw ratio (ideal 1.3), and ${tiltTypeLabel.toLowerCase()} canthal tilt (${avgTilt >= 0 ? '+' : ''}${avgTilt.toFixed(1)}°).`,
    symmetry: {
      score: symScore,
      details: `Minimal lateral variance (${devPct.toFixed(1)}%) across bilateral landmarks relative to sagittal midline.`,
      pillText: `Variance: ${devPct.toFixed(1)}%`,
      leftRightVariance: `Variance: ${devPct.toFixed(1)}%`
    },
    goldenRatio: {
      score: phiScore,
      details: `Forehead ${pct1.toFixed(1)}%, midface ${pct2.toFixed(1)}%, lower third ${pct3.toFixed(1)}% (ideal 33.3% each).`,
      pillText: thirdsRatioText,
      phiDeviation: `Forehead ${pct1.toFixed(1)}%, midface ${pct2.toFixed(1)}%, lower third ${pct3.toFixed(1)}% (ideal 33.3% each).`,
      thirdsAdherence: thirdsRatioText
    },
    jawline: {
      score: jawScore,
      details: `Mandibular gonial angle measured at ${avgGonialAngle.toFixed(1)}° (ideal reference: 120°).`,
      pillText: `Gonial: ${avgGonialAngle.toFixed(1)}°`,
      gonialAngle: `${avgGonialAngle.toFixed(1)}°`,
      definition: `Mandibular gonial angle measured at ${avgGonialAngle.toFixed(1)}° (ideal reference: 120°).`
    },
    cheekbones: {
      score: cheekScore,
      details: `Bizygomatic breadth to jaw ratio of ${cheekJawRatio.toFixed(2)}x (ideal classical standard: 1.30x).`,
      pillText: `Ratio: ${cheekJawRatio.toFixed(2)}x`,
      prominence: `Bizygomatic breadth to jaw ratio of ${cheekJawRatio.toFixed(2)}x (ideal classical standard: 1.30x).`,
      midfaceRatio: `Ratio: ${cheekJawRatio.toFixed(2)}x`
    },
    canthalTilt: {
      score: canthalScore,
      details: `${tiltTypeLabel} palpebral axis inclination with outer canthus at ${avgTilt >= 0 ? '+' : ''}${avgTilt.toFixed(1)}°.`,
      pillText: `${tiltTypeLabel} (${avgTilt >= 0 ? '+' : ''}${avgTilt.toFixed(1)}°)`,
      tiltType: `${tiltTypeLabel} (${avgTilt >= 0 ? '+' : ''}${avgTilt.toFixed(1)}°)`,
      eyeSpacing: `${tiltTypeLabel} palpebral axis inclination with outer canthus at ${avgTilt >= 0 ? '+' : ''}${avgTilt.toFixed(1)}°.`
    },
    biologicalAge: {
      score: ageVal,
      details: `Neural model estimated biological tissue age at ${ageVal} yrs (predicted gender: ${realGender || 'profile'}).`,
      pillText: `Vitality: ${skinVitality}/100`,
      estimatedAge: ageVal,
      confidenceRange,
      skinVitalityScore: skinVitality,
      observations: `Facial model estimated biological tissue age at ${ageVal} yrs (predicted gender: ${realGender || 'profile'}).`
    },
    keyStrengths: strengths.slice(0, 3),
    recommendations
  };
}

// -------------------------------------------------------------
// FIX 4 — REWRITE runFullFaceAnalysis() TO FAIL VISIBLY
// -------------------------------------------------------------
export async function runFullFaceAnalysis(imageDataUrl) {
  currentImageBase64 = imageDataUrl;
  hideClarityError();

  // Guard: models not ready
  if (modelsLoadError) {
    showClarityError('Face analysis engine failed to load. Please refresh the page and try again.');
    return;
  }
  if (!modelsReady) {
    const loaded = await loadFaceModels();
    if (!loaded || !modelsReady) {
      showClarityError('Face analysis engine is still loading. Please wait 5 seconds and try again.');
      return;
    }
  }

  const testImg = new Image();
  testImg.crossOrigin = 'anonymous';

  testImg.onload = async () => {
    currentImgDimensions = {
      width: testImg.naturalWidth || 600,
      height: testImg.naturalHeight || 750
    };

    // Step 1: clarity check (existing function)
    const clarity = validateClientClarity(testImg);
    if (!clarity.valid) {
      showClarityError(clarity.error);
      return;
    }

    // Step 2: show scanning overlay
    const inputArea = document.getElementById('analyzerInputArea');
    const resultDash = document.getElementById('resultDashboard');
    const scanOverlay = document.getElementById('scanningOverlay');
    const scanImg = document.getElementById('scanningImgPreview');

    if (inputArea) inputArea.style.display = 'none';
    if (resultDash) resultDash.style.display = 'none';
    if (scanOverlay) scanOverlay.style.display = 'block';
    if (scanImg) scanImg.src = imageDataUrl;

    const stepText = document.getElementById('scanStepText');
    if (stepText) stepText.textContent = 'Detecting facial coordinates and 68 landmarks...';

    try {
      // Step 3: run face detection
      const api = getFaceApi();
      const detection = await api
        .detectSingleFace(testImg, new api.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }))
        .withFaceLandmarks()
        .withAgeAndGender();

      if (!detection) {
        document.getElementById('scanningOverlay')?.style.setProperty('display', 'none');
        document.getElementById('analyzerInputArea')?.style.setProperty('display', 'block');
        showClarityError('No face detected. Please upload a clear, well-lit photo of a single human face facing the camera.');
        return;
      }

      // Step 4: build result object from REAL data
      const landmarks = detection.landmarks.positions;
      const realAge = Math.round(detection.age);
      const realGender = detection.gender;

      currentRealLandmarks = landmarks;
      currentDetectionBox = detection.detection.box;

      const result = buildResultFromLandmarks(landmarks, realAge, realGender, detection);
      displayAnalysisResults(result, imageDataUrl);

    } catch (err) {
      console.error('[FaceAnalyzer] Detection failed:', err);
      document.getElementById('scanningOverlay')?.style.setProperty('display', 'none');
      document.getElementById('analyzerInputArea')?.style.setProperty('display', 'block');
      showClarityError('Something went wrong during analysis. Please try another photo.');
    }
  };

  testImg.onerror = () => {
    document.getElementById('scanningOverlay')?.style.setProperty('display', 'none');
    document.getElementById('analyzerInputArea')?.style.setProperty('display', 'block');
    showClarityError('Could not load the image. Please try a different file.');
  };

  testImg.src = imageDataUrl;
}

// -------------------------------------------------------------
// FIX 6 — REMOVE ALL RANDOM NUMBER FALLBACKS
// -------------------------------------------------------------
function displayAnalysisResults(data, imgDataUrl) {
  if (!data) {
    showClarityError('Analysis could not be completed. Please try again.');
    return;
  }
  currentAnalysisData = data;

  document.getElementById('scanningOverlay')?.style.setProperty('display', 'none');
  const resultDash = document.getElementById('resultDashboard');
  if (resultDash) resultDash.style.display = 'block';

  // Hero Score
  const scoreEl = document.getElementById('resAttractivenessScore');
  const tierEl = document.getElementById('resHarmonyTier');
  const summaryEl = document.getElementById('resSummaryText');
  if (scoreEl) scoreEl.textContent = currentAnalysisData.attractivenessScore;
  if (tierEl) tierEl.textContent = currentAnalysisData.harmonyTier || 'Exceptional Facial Harmony';
  if (summaryEl) summaryEl.textContent = currentAnalysisData.summary || '';

  // 1. Symmetry
  if (currentAnalysisData.symmetry && currentAnalysisData.symmetry.score != null) {
    setMetric('resSymScore', 'barSym', 'resSymDetail', 'resSymPill', 
      `${currentAnalysisData.symmetry.score}%`,
      currentAnalysisData.symmetry.score,
      currentAnalysisData.symmetry.details,
      currentAnalysisData.symmetry.leftRightVariance || 'Variance: <2%'
    );
  } else {
    setMetric('resSymScore', 'barSym', 'resSymDetail', 'resSymPill', 'Unable to calculate', 0, 'Unable to calculate symmetry from landmarks.', 'N/A');
  }

  // 2. Golden Ratio
  if (currentAnalysisData.goldenRatio && currentAnalysisData.goldenRatio.score != null) {
    setMetric('resPhiScore', 'barPhi', 'resPhiDetail', 'resPhiPill',
      `${currentAnalysisData.goldenRatio.score}%`,
      currentAnalysisData.goldenRatio.score,
      currentAnalysisData.goldenRatio.phiDeviation,
      currentAnalysisData.goldenRatio.thirdsAdherence || 'Phi: 1:1.618'
    );
  } else {
    setMetric('resPhiScore', 'barPhi', 'resPhiDetail', 'resPhiPill', 'Unable to calculate', 0, 'Unable to calculate vertical thirds.', 'N/A');
  }

  // 3. Jawline
  if (currentAnalysisData.jawline && currentAnalysisData.jawline.score != null) {
    setMetric('resJawScore', 'barJaw', 'resJawDetail', 'resJawPill',
      `${currentAnalysisData.jawline.score}%`,
      currentAnalysisData.jawline.score,
      currentAnalysisData.jawline.definition,
      `Gonial: ${currentAnalysisData.jawline.gonialAngle}`
    );
  } else {
    setMetric('resJawScore', 'barJaw', 'resJawDetail', 'resJawPill', 'Unable to calculate', 0, 'Unable to calculate jawline angle.', 'N/A');
  }

  // 4. Cheekbones
  if (currentAnalysisData.cheekbones && currentAnalysisData.cheekbones.score != null) {
    setMetric('resCheekScore', 'barCheek', 'resCheekDetail', 'resCheekPill',
      `${currentAnalysisData.cheekbones.score}%`,
      currentAnalysisData.cheekbones.score,
      currentAnalysisData.cheekbones.prominence,
      currentAnalysisData.cheekbones.midfaceRatio || 'Zygomatic Arch'
    );
  } else {
    setMetric('resCheekScore', 'barCheek', 'resCheekDetail', 'resCheekPill', 'Unable to calculate', 0, 'Unable to calculate cheekbone prominence.', 'N/A');
  }

  // 5. Canthal Tilt
  if (currentAnalysisData.canthalTilt && currentAnalysisData.canthalTilt.score != null) {
    setMetric('resCanthalScore', 'barCanthal', 'resCanthalDetail', 'resCanthalPill',
      `${currentAnalysisData.canthalTilt.score}%`,
      currentAnalysisData.canthalTilt.score,
      currentAnalysisData.canthalTilt.eyeSpacing,
      currentAnalysisData.canthalTilt.tiltType
    );
  } else {
    setMetric('resCanthalScore', 'barCanthal', 'resCanthalDetail', 'resCanthalPill', 'Unable to calculate', 0, 'Unable to calculate canthal tilt.', 'N/A');
  }

  // 6. Biological Age
  if (currentAnalysisData.biologicalAge && currentAnalysisData.biologicalAge.estimatedAge != null) {
    setMetric('resAgeScore', 'barAge', 'resAgeDetail', 'resAgePill',
      `${currentAnalysisData.biologicalAge.estimatedAge} yrs`,
      Math.min(100, Math.max(10, currentAnalysisData.biologicalAge.skinVitalityScore || 80)),
      currentAnalysisData.biologicalAge.observations,
      `Vitality: ${currentAnalysisData.biologicalAge.skinVitalityScore || 80}/100`
    );
  } else {
    setMetric('resAgeScore', 'barAge', 'resAgeDetail', 'resAgePill', 'Unable to calculate', 0, 'Unable to estimate biological age.', 'N/A');
  }

  // Strengths & Recommendations
  const strengthsList = document.getElementById('resStrengthsList');
  if (strengthsList && currentAnalysisData.keyStrengths) {
    strengthsList.innerHTML = currentAnalysisData.keyStrengths.map(s => `<li>★ ${s}</li>`).join('');
  }
  const recList = document.getElementById('resRecommendationsList');
  if (recList && currentAnalysisData.recommendations) {
    recList.innerHTML = currentAnalysisData.recommendations.map(r => `<li>★ ${r}</li>`).join('');
  }

  // Result photo & landmark canvas
  const resultImg = document.getElementById('resultPhotoImg');
  if (resultImg) {
    resultImg.src = imgDataUrl;
    resultImg.onload = () => {
      redrawLandmarkCanvas();
    };
  }

  resultDash?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setMetric(scoreId, barId, detailId, pillId, scoreTxt, barVal, detailTxt, pillTxt) {
  const s = document.getElementById(scoreId);
  const b = document.getElementById(barId);
  const d = document.getElementById(detailId);
  const p = document.getElementById(pillId);
  if (s) s.textContent = scoreTxt;
  if (b) b.style.width = `${barVal}%`;
  if (d) d.textContent = detailTxt;
  if (p) p.textContent = pillTxt;
}

// Landmark Drawing with REAL coordinates
export function redrawLandmarkCanvas() {
  const img = document.getElementById('resultPhotoImg');
  const canvas = document.getElementById('landmarkOverlayCanvas');
  if (!img || !canvas) return;

  canvas.width = img.clientWidth || 320;
  canvas.height = img.clientHeight || 420;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cw = canvas.width;
  const ch = canvas.height;

  const showThirds = document.getElementById('toggleThirds')?.checked ?? true;
  const showSymmetry = document.getElementById('toggleSymmetry')?.checked ?? true;
  const showJaw = document.getElementById('toggleJaw')?.checked ?? true;

  // Real scale factors from original image to canvas
  const imgW = currentImgDimensions.width || 600;
  const imgH = currentImgDimensions.height || 750;
  const scaleX = cw / imgW;
  const scaleY = ch / imgH;

  const pts = currentRealLandmarks;

  // 1. Thirds
  if (showThirds) {
    ctx.strokeStyle = '#4da2ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    let yHairline = ch * 0.22;
    let yBrow = ch * 0.42;
    let ySubnasale = ch * 0.62;
    let yChin = ch * 0.82;

    if (pts && currentDetectionBox) {
      yHairline = Math.max(0, currentDetectionBox.y * scaleY);
      yBrow = ((pts[19].y + pts[24].y) / 2) * scaleY;
      ySubnasale = pts[33].y * scaleY;
      yChin = pts[8].y * scaleY;
    }

    [yHairline, yBrow, ySubnasale, yChin].forEach(y => {
      ctx.beginPath();
      ctx.moveTo(cw * 0.08, y);
      ctx.lineTo(cw * 0.92, y);
      ctx.stroke();
    });

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(77, 162, 255, 0.45)';
    ctx.beginPath();
    ctx.arc(cw * 0.5, (yBrow + ySubnasale) / 2, cw * 0.35, 0, Math.PI * 1.5);
    ctx.stroke();
  }

  // 2. Symmetry
  if (showSymmetry) {
    ctx.setLineDash([]);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;

    let midX = cw * 0.5;
    let topY = ch * 0.15;
    let botY = ch * 0.85;

    if (pts) {
      midX = ((pts[27].x + pts[30].x + pts[33].x + pts[8].x) / 4) * scaleX;
      topY = (pts[27].y - 20) * scaleY;
      botY = pts[8].y * scaleY;
    }

    ctx.beginPath();
    ctx.moveTo(midX, Math.max(10, topY));
    ctx.lineTo(midX, botY);
    ctx.stroke();

    // Eye axis line
    ctx.strokeStyle = '#55db9c';
    ctx.lineWidth = 2;
    let leftEye = { x: cw * 0.35, y: ch * 0.45 };
    let rightEye = { x: cw * 0.65, y: ch * 0.45 };

    if (pts) {
      leftEye = { x: pts[36].x * scaleX, y: pts[36].y * scaleY };
      rightEye = { x: pts[45].x * scaleX, y: pts[45].y * scaleY };
    }

    ctx.beginPath();
    ctx.moveTo(leftEye.x - 15, leftEye.y);
    ctx.lineTo(rightEye.x + 15, rightEye.y);
    ctx.stroke();

    // Landmark markers
    ctx.fillStyle = '#55db9c';
    [leftEye, rightEye].forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  // 3. Jaw
  if (showJaw) {
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffd731';
    ctx.lineWidth = 2.5;

    if (pts) {
      // Connect real jaw points 0 to 16
      ctx.beginPath();
      ctx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
      for (let i = 1; i <= 16; i++) {
        ctx.lineTo(pts[i].x * scaleX, pts[i].y * scaleY);
      }
      ctx.stroke();

      // Highlight gonion points 4, chin 8, and gonion 12
      ctx.fillStyle = '#ffd731';
      [pts[4], pts[8], pts[12]].forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x * scaleX, pt.y * scaleY, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    } else {
      ctx.beginPath();
      ctx.moveTo(cw * 0.26, ch * 0.66);
      ctx.lineTo(cw * 0.36, ch * 0.76);
      ctx.lineTo(cw * 0.5, ch * 0.84);
      ctx.lineTo(cw * 0.64, ch * 0.76);
      ctx.lineTo(cw * 0.74, ch * 0.66);
      ctx.stroke();
    }
  }
}

export function resetAnalyzer() {
  const resultDash = document.getElementById('resultDashboard');
  const inputArea = document.getElementById('analyzerInputArea');
  if (resultDash) resultDash.style.display = 'none';
  if (inputArea) inputArea.style.display = 'block';
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';
  document.getElementById('analyzer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// DOWNLOADABLE SCORECARD GENERATOR
export function downloadAnalysisCard() {
  if (!currentAnalysisData || !currentImageBase64) {
    showToast('Please analyze a photo before downloading.');
    return;
  }

  const canvas = document.getElementById('downloadCardCanvas');
  if (!canvas) return;
  canvas.width = 1200;
  canvas.height = 1500;
  const ctx = canvas.getContext('2d');

  // Slush Pastel Sky Wash Card Canvas
  ctx.fillStyle = '#dceeff';
  ctx.fillRect(0, 0, 1200, 1500);

  // Outer Black Hand-Cut Border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 6;
  ctx.strokeRect(30, 30, 1140, 1440);

  // Header Banner Box
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(50, 50, 1100, 110);
  ctx.strokeRect(50, 50, 1100, 110);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('★ TOOL GENIE — FULL FACE BIOMETRICS', 80, 115);

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`REAL AI LANDMARK SCAN • ${dateStr}`, 780, 115);

  const userImg = new Image();
  userImg.crossOrigin = 'anonymous';
  userImg.onload = () => {
    // User Photo Card
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(50, 180, 480, 580);
    ctx.strokeRect(50, 180, 480, 580);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(70, 200, 440, 540, 20);
    ctx.clip();
    ctx.drawImage(userImg, 70, 200, 440, 540);
    ctx.restore();

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeRect(70, 200, 440, 540);

    // Attractiveness Score Card
    ctx.fillStyle = '#e9ccff';
    ctx.fillRect(560, 180, 590, 580);
    ctx.strokeRect(560, 180, 590, 580);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('OVERALL AESTHETIC HARMONY SCORE', 600, 240);

    // Real score
    ctx.font = '900 115px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${currentAnalysisData.attractivenessScore}`, 600, 360);

    ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('/ 100', 740, 360);

    // Tier badge
    ctx.fillStyle = '#55db9c';
    ctx.fillRect(600, 395, 470, 44);
    ctx.strokeRect(600, 395, 470, 44);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(currentAnalysisData.harmonyTier || 'Exceptional Facial Harmony', 618, 424);

    ctx.font = '19px "Plus Jakarta Sans", sans-serif';
    wrapText(ctx, currentAnalysisData.summary || '', 600, 485, 510, 30);

    // The 6 Tool Cards Grid
    const tools = [
      { title: '1. Facial Symmetry', score: `${currentAnalysisData.symmetry.score}%`, desc: currentAnalysisData.symmetry.details, bg: '#ffffff' },
      { title: '2. Golden Ratio (Φ)', score: `${currentAnalysisData.goldenRatio.score}%`, desc: currentAnalysisData.goldenRatio.phiDeviation, bg: '#ffd731' },
      { title: '3. Jawline Definition', score: `${currentAnalysisData.jawline.score}%`, desc: `Angle: ${currentAnalysisData.jawline.gonialAngle}`, bg: '#55db9c' },
      { title: '4. Cheekbone Prominence', score: `${currentAnalysisData.cheekbones.score}%`, desc: currentAnalysisData.cheekbones.prominence, bg: '#ffffff' },
      { title: '5. Canthal Tilt', score: `${currentAnalysisData.canthalTilt.score}%`, desc: currentAnalysisData.canthalTilt.tiltType, bg: '#4da2ff' },
      { title: '6. Biological Age', score: `${currentAnalysisData.biologicalAge.estimatedAge} yrs`, desc: `Vitality: ${currentAnalysisData.biologicalAge.skinVitalityScore}/100`, bg: '#ffffff' }
    ];

    const cardW = 346;
    const cardH = 175;
    const startX = 50;
    const startY = 800;

    tools.forEach((tool, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const x = startX + col * (cardW + 31);
      const y = startY + row * (cardH + 25);

      ctx.fillStyle = tool.bg;
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, cardW, cardH);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(tool.title, x + 18, y + 36);

      ctx.font = '900 32px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(tool.score, x + 18, y + 80);

      ctx.font = '15px "Plus Jakarta Sans", sans-serif';
      wrapText(ctx, tool.desc, x + 18, y + 115, cardW - 36, 22);
    });

    // Footer Watermark
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(50, 1370, 1100, 80);
    ctx.strokeRect(50, 1370, 1100, 80);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('TOOL GENIE • REAL CLIENT-SIDE FACE-API.JS BIOMETRICS • 100% PRIVATE', 80, 1418);
    ctx.fillText('HTTP://TOOLGENIE.AI', 920, 1418);

    try {
      const dataURL = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `tool-genie-real-biometrics-${Date.now()}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Analysis Card downloaded successfully!');
    } catch (downloadErr) {
      console.error('Download card error:', downloadErr);
      showToast('Could not complete download automatically.');
    }
  };

  userImg.src = currentImageBase64;
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = context.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      context.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  context.fillText(line, x, y);
}

// Global window bindings for inline HTML event handlers
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.openContactModal = openContactModal;
window.closeContactModal = closeContactModal;
window.handleContactSubmit = handleContactSubmit;
window.switchInputMode = switchInputMode;
window.requestCameraAccess = requestCameraAccess;
window.captureLiveSnapshot = captureLiveSnapshot;
window.retryScan = retryScan;
window.handleFileSelect = handleFileSelect;
window.loadSample = loadSample;
window.resetAnalyzer = resetAnalyzer;
window.stopWebcam = stopWebcam;
window.downloadAnalysisCard = downloadAnalysisCard;
window.redrawLandmarkCanvas = redrawLandmarkCanvas;
window.loadFaceModels = loadFaceModels;
window.buildResultFromLandmarks = buildResultFromLandmarks;
window.runFullFaceAnalysis = runFullFaceAnalysis;
