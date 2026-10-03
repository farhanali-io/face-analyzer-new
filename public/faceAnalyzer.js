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
let currentFacingMode = 'user'; // 'user' = front, 'environment' = back

let modelsReady = false;
let modelsLoadError = null;

// Helper to access faceapi
function getFaceApi() {
  if (typeof window !== 'undefined' && window.faceapi) {
    return window.faceapi;
  }
  if (faceapiNpm && faceapiNpm.nets) {
    return faceapiNpm;
  }
  return faceapiNpm;
}

// Model Loading
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

    // Ensure TensorFlow.js backend is properly initialized (avoid uninitialized webgpu errors)
    const tf = api.tf || (typeof window !== 'undefined' ? window.tf : null);
    if (tf) {
      try {
        if (typeof tf.setBackend === 'function') {
          try {
            await tf.setBackend('webgl');
          } catch (bErr) {
            console.warn('[FaceAnalyzer] WebGL backend selection note:', bErr);
          }
        }
        if (typeof tf.ready === 'function') {
          await tf.ready();
        }
      } catch (tfErr) {
        console.warn('[FaceAnalyzer] tf init warning, falling back to cpu:', tfErr);
        try {
          if (typeof tf.setBackend === 'function') {
            await tf.setBackend('cpu');
          }
          if (typeof tf.ready === 'function') {
            await tf.ready();
          }
        } catch (cpuErr) {
          console.warn('[FaceAnalyzer] cpu fallback failed:', cpuErr);
        }
      }
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

// Contact Modal Controls
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

// Input Mode Toggle
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

    const permPrompt = document.getElementById('cameraPermissionPrompt');
    const activeArea = document.getElementById('cameraActiveArea');
    const video = document.getElementById('webcamVideo');

    if (!webcamStream || !webcamStream.active) {
      if (permPrompt) permPrompt.style.display = 'block';
      if (activeArea) activeArea.style.display = 'none';
    } else {
      if (permPrompt) permPrompt.style.display = 'none';
      if (activeArea) activeArea.style.display = 'block';

      if (video && video.srcObject !== webcamStream) {
        video.srcObject = webcamStream;
        if (video.readyState >= 2) {
          startAutoDetection();
        } else {
          video.onloadedmetadata = () => startAutoDetection();
        }
      } else if (video && video.readyState >= 2) {
        startAutoDetection();
      }
    }

    setTimeout(() => {
      const cameraArea = document.getElementById('cameraActiveArea') || cameraCont;
      if (cameraArea) {
        cameraArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 400);
  }
}

// Request Camera Access
export async function requestCameraAccess() {
  const video = document.getElementById('webcamVideo');

  if (webcamStream && webcamStream.active) {
    if (video) {
      video.srcObject = webcamStream;
      const permPrompt = document.getElementById('cameraPermissionPrompt');
      const activeArea = document.getElementById('cameraActiveArea');
      if (permPrompt) permPrompt.style.display = 'none';
      if (activeArea) activeArea.style.display = 'block';

      if (video.readyState >= 2) {
        startAutoDetection();
      } else {
        video.onloadedmetadata = () => startAutoDetection();
      }

      setTimeout(() => {
        const cameraArea = document.getElementById('cameraActiveArea');
        if (cameraArea) {
          cameraArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
    return;
  }

  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 720 },
        height: { ideal: 960 }
      },
      audio: false
    });
    if (video) {
      video.srcObject = webcamStream;

      // Apply correct mirror based on current camera
      if (currentFacingMode === 'user') {
        video.style.transform = 'scaleX(-1)';
      } else {
        video.style.transform = 'scaleX(1)';
      }

      video.onloadedmetadata = () => {
        const permPrompt = document.getElementById('cameraPermissionPrompt');
        const activeArea = document.getElementById('cameraActiveArea');
        if (permPrompt) permPrompt.style.display = 'none';
        if (activeArea) activeArea.style.display = 'block';
        startAutoDetection();

        setTimeout(() => {
          const cameraArea = document.getElementById('cameraActiveArea');
          if (cameraArea) {
            cameraArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      };
    }
  } catch (err) {
    console.error('Camera access error:', err);
    showToast('Camera access unavailable. You can upload a photo or use demo portraits instead.');
    switchInputMode('upload');
  }
}

// ✅ Switch between front and back camera
export async function switchCamera() {
  const video = document.getElementById('webcamVideo');
  const flipBtn = document.getElementById('cameraFlipBtn');

  if (!video) return;

  // Disable button during switch
  if (flipBtn) {
    flipBtn.disabled = true;
    flipBtn.style.opacity = '0.5';
  }

  stopAutoDetection();

  // Toggle facing mode
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

  // Stop current stream
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }

  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 720 },
        height: { ideal: 960 }
      },
      audio: false
    });

    video.srcObject = webcamStream;

    // Mirror only for front camera
    if (currentFacingMode === 'user') {
      video.style.transform = 'scaleX(-1)';
    } else {
      video.style.transform = 'scaleX(1)';
    }

    video.onloadedmetadata = () => {
      video.play().catch(() => {});
      setTimeout(() => {
        startAutoDetection();

        const pill = document.getElementById('cameraAlignmentPill');
        const statusText = document.getElementById('cameraStatusText');
        if (pill) pill.classList.remove('aligned');
        if (statusText) statusText.textContent = 'Align your face inside the grid';
      }, 300);
    };

    if (flipBtn) {
      flipBtn.disabled = false;
      flipBtn.style.opacity = '1';
    }

    showToast(currentFacingMode === 'user' ? 'Front camera' : 'Back camera');

  } catch (err) {
    console.error('Camera switch failed:', err);

    // Revert facing mode
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

    showToast('Could not switch camera. Your device may not have multiple cameras.');

    if (flipBtn) {
      flipBtn.disabled = false;
      flipBtn.style.opacity = '1';
    }

    // Restore original camera
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: currentFacingMode } },
        audio: false
      });
      video.srcObject = webcamStream;
      video.onloadedmetadata = () => {
        video.play().catch(() => {});
        startAutoDetection();
      };
    } catch (restoreErr) {
      console.error('Could not restore camera:', restoreErr);
      showClarityError('Camera unavailable. Please refresh the page and try again.');
    }
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
      let faceCenterX = 0;
      let faceCenterY = 0;
      let facePixelCount = 0;

      for (let y = 0; y < 213; y += 4) {
        for (let x = 0; x < 160; x += 4) {
          const idx = (y * 160 + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          if (y >= 50 && y < 160 && x >= 40 && x < 120) {
            totalLum += lum;
            sampleCount++;
          }

          if (r > 55 && g > 38 && b > 25 && r > g && r > b && Math.abs(r - g) > 12) {
            skinPixels++;
            faceCenterX += x;
            faceCenterY += y;
            facePixelCount++;
          }
        }
      }

      const avgLum = totalLum / Math.max(1, sampleCount);
      const skinRatio = skinPixels / Math.max(1, sampleCount);
      const pill = document.getElementById('cameraAlignmentPill');
      const statusText = document.getElementById('cameraStatusText');

      let isCentered = true;
      if (facePixelCount > 20) {
        faceCenterX = faceCenterX / facePixelCount;
        faceCenterY = faceCenterY / facePixelCount;
        const offsetX = Math.abs(faceCenterX - 80);
        const offsetY = Math.abs(faceCenterY - 106);
        isCentered = offsetX < 35 && offsetY < 45;
      }

      if (skinRatio >= 0.35 && avgLum >= 38 && avgLum <= 230 && isCentered) {
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
      } else if (skinRatio >= 0.35 && avgLum >= 38 && avgLum <= 230 && !isCentered) {
        alignedStreak = Math.max(0, alignedStreak - 1);
        if (!isCountingDown) {
          pill?.classList.remove('aligned');
          if (statusText) statusText.textContent = '★ Face ko frame ke center mein layein';
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

  // Mirror only for front camera
  if (currentFacingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.94);

  stopAutoDetection();
  runFullFaceAnalysis(dataUrl);
}

// Clarity Pre-validator
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
  stopAutoDetection();

  document.getElementById('scanningOverlay')?.style.setProperty('display', 'none');
  document.getElementById('resultDashboard')?.style.setProperty('display', 'none');

  const inputArea = document.getElementById('analyzerInputArea');
  if (inputArea) inputArea.style.display = 'block';

  if (webcamStream && webcamStream.active) {
    const cameraActiveArea = document.getElementById('cameraActiveArea');
    const permPrompt = document.getElementById('cameraPermissionPrompt');

    if (cameraActiveArea) cameraActiveArea.style.display = 'none';
    if (permPrompt) permPrompt.style.display = 'none';
  }

  const pill = document.getElementById('cameraAlignmentPill');
  const statusText = document.getElementById('cameraStatusText');
  if (pill) pill.classList.remove('aligned');
  if (statusText) statusText.textContent = 'Align your face inside the grid';

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
  resetAnalyzer();
}

// File Reading
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

// Demo Portraits
export function loadSample(type) {
  hideClarityError();
  const url = type === 'female' ? '/female.jpg' : '/male.jpg';
  runFullFaceAnalysis(url);
}

// Build Result From Real Landmarks
// =====================================================================
// COMPUTATION HELPERS (Client-side, 68 landmarks + Age/Gender)
// =====================================================================

function clamp(val, min = 2.0, max = 10.0) {
  return Math.max(min, Math.min(max, val));
}

function round1(val) {
  return Number(val.toFixed(1));
}

function computeImageBrightnessStdDev(img) {
  try {
    const canvas = document.createElement('canvas');
    const w = 64;
    const h = 64;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 15;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    const lums = [];
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += lum;
      lums.push(lum);
    }
    const mean = sum / lums.length;
    let varSum = 0;
    for (let i = 0; i < lums.length; i++) {
      varSum += (lums[i] - mean) ** 2;
    }
    return Math.sqrt(varSum / lums.length);
  } catch (_) {
    return 15;
  }
}

// 4. Face Shape
function getFaceShape(pts) {
  const faceHeight = Math.abs(pts[8].y - pts[27].y);
  const faceWidth = Math.max(1, Math.abs(pts[15].x - pts[1].x));
  const ratio = faceHeight / faceWidth;
  if (ratio > 1.55) return 'Oblong';
  if (ratio >= 1.35) return 'Oval';
  if (ratio >= 1.15) return 'Square';
  if (ratio >= 0.95) return 'Round';
  return 'Heart';
}

// 6. Facial Symmetry (0-10)
function calcSymmetry(pts, faceWidth, midlineX) {
  const symmetricPairs = [
    [0, 16], [1, 15], [2, 14], [3, 13], [4, 12], [5, 11], [6, 10], [7, 9],
    [17, 26], [18, 25], [19, 24], [20, 23], [21, 22],
    [36, 45], [37, 44], [38, 43], [39, 42], [40, 47], [41, 46],
    [31, 35], [32, 34],
    [48, 54], [49, 53], [50, 52], [59, 55], [58, 56]
  ];
  let totalSymDiff = 0;
  for (const [l, r] of symmetricPairs) {
    const distL = Math.abs(pts[l].x - midlineX);
    const distR = Math.abs(pts[r].x - midlineX);
    totalSymDiff += Math.abs(distL - distR);
  }
  const avgSymDiff = totalSymDiff / symmetricPairs.length;
  const devPct = (avgSymDiff / faceWidth) * 100;
  return clamp(round1(10 - devPct * 0.5));
}

// 7. Facial Proportions (0-10)
function calcProportions(pts, detection) {
  const boxY = detection?.box?.y ?? detection?.detection?.box?.y ?? Math.max(0, pts[19].y - (pts[8].y - pts[19].y) * 0.35);
  const hairlineY = Math.max(0, boxY);
  let sumBrowY = 0;
  for (let i = 19; i <= 24; i++) sumBrowY += pts[i].y;
  const browY = sumBrowY / 6;
  const subnasaleY = pts[33].y;
  const chinY = pts[8].y;

  const third1 = Math.max(1, browY - hairlineY);
  const third2 = Math.max(1, subnasaleY - browY);
  const third3 = Math.max(1, chinY - subnasaleY);
  const totalH = third1 + third2 + third3;

  const pct1 = (third1 / totalH) * 100;
  const pct2 = (third2 / totalH) * 100;
  const pct3 = (third3 / totalH) * 100;
  const varThirds = (Math.abs(pct1 - 33.33) + Math.abs(pct2 - 33.33) + Math.abs(pct3 - 33.33)) / 3;
  return clamp(round1(10 - varThirds * 0.3));
}

// 8. Jawline Definition (0-10)
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

function calcJawline(pts) {
  const leftGonial = calcAngle(pts[1], pts[4], pts[8]);
  const rightGonial = calcAngle(pts[15], pts[12], pts[8]);
  const avgAngle = (leftGonial + rightGonial) / 2;
  const score = clamp(round1(10 - Math.abs(avgAngle - 120) * 0.25));
  return { score, angle: avgAngle };
}

// 9. Cheekbone Prominence (0-10)
function calcCheekbones(pts) {
  const cheekboneWidth = Math.hypot(pts[15].x - pts[1].x, pts[15].y - pts[1].y);
  const jawWidth = Math.max(1, Math.hypot(pts[11].x - pts[5].x, pts[11].y - pts[5].y));
  const ratio = cheekboneWidth / jawWidth;
  return clamp(round1(10 - Math.abs(ratio - 1.3) * 20));
}

// 10. Eye Balance (0-10)
function calcEyeBalance(pts, faceWidth, midlineX) {
  const dyLeft = pts[39].y - pts[36].y;
  const dxLeft = pts[39].x - pts[36].x;
  const leftTilt = Math.atan2(dyLeft, dxLeft) * (180 / Math.PI);

  const dyRight = pts[42].y - pts[45].y;
  const dxRight = pts[45].x - pts[42].x;
  const rightTilt = Math.atan2(dyRight, dxRight) * (180 / Math.PI);

  const avgTilt = (leftTilt + rightTilt) / 2;
  const leftEyeCenter = (pts[36].x + pts[39].x) / 2;
  const rightEyeCenter = (pts[42].x + pts[45].x) / 2;
  const spacingDiff = Math.abs(Math.abs(leftEyeCenter - midlineX) - Math.abs(rightEyeCenter - midlineX)) / Math.max(1, faceWidth) * 10;
  return clamp(round1(8 + avgTilt * 0.5 - spacingDiff));
}

// 11. Nose Balance (0-10)
function calcNoseBalance(pts, faceWidth, faceHeight) {
  const noseWidth = Math.abs(pts[31].x - pts[35].x);
  const noseLength = Math.max(1, Math.abs(pts[27].y - pts[33].y));
  const idealW = faceWidth * 0.2;
  const idealL = faceHeight * 0.33;
  const devW = Math.abs(noseWidth - idealW) / Math.max(1, faceWidth);
  const devL = Math.abs(noseLength - idealL) / Math.max(1, faceHeight);
  const deviation = (devW + devL) / 2;
  return clamp(round1(10 - deviation * 30));
}

// 12. Lip Proportion (0-10)
function calcLipProportion(pts) {
  const upperLipHeight = Math.max(1, Math.abs(pts[51].y - pts[62].y));
  const lowerLipHeight = Math.max(1, Math.abs(pts[66].y - pts[57].y));
  const ratio = lowerLipHeight / upperLipHeight;
  return clamp(round1(10 - Math.abs(ratio - 1.3) * 8));
}

// 13. Bone Structure (0-10)
function calcBoneStructure(pts, jawScore, cheekScore, faceHeight) {
  const browHeight = Math.abs(pts[19].y - pts[27].y);
  const browRatio = browHeight / Math.max(1, faceHeight);
  const browScore = clamp(8 + (browRatio - 0.12) * 20);
  return clamp(round1((jawScore + cheekScore + browScore) / 3));
}

// 14. Skin Vitality (0-10)
function calcSkinVitality(age, brightnessStdDev) {
  const ageScore = clamp(10 - Math.max(0, (age - 20) * 0.15), 3.0, 10.0);
  const brightnessScore = clamp(10 - (brightnessStdDev / 30), 2.0, 10.0);
  return clamp(round1(ageScore * 0.6 + brightnessScore * 0.4));
}

// 15. Masculinity / Femininity Index (0-10)
function calcMasculinity(pts, gender, gonialAngle, faceWidth) {
  const isMale = (gender || '').toLowerCase() === 'male';
  const jawWidth = Math.abs(pts[11].x - pts[5].x);
  const jawWidthRatio = jawWidth / Math.max(1, faceWidth);

  if (isMale) {
    const gonialSharpness = clamp((130 - gonialAngle) / 10, 0, 3);
    return clamp(round1(5 + gonialSharpness + jawWidthRatio * 3));
  } else {
    const gonialSoftness = clamp((gonialAngle - 118) / 10, 0, 3);
    const narrowJaw = clamp(1 - jawWidthRatio, 0, 1);
    return clamp(round1(6 + gonialSoftness + narrowJaw * 2));
  }
}

// 16. Youthfulness (0-10)
function calcYouthfulness(age) {
  return clamp(round1(10 - Math.max(0, (age - 18) * 0.12)));
}

// Curated static tips
const TIPS = {
  skin: {
    low: [
      "Use broad-spectrum SPF 30+ daily to safeguard dermal collagen",
      "Introduce a gentle hydrating cleanser morning and night",
      "Layer hyaluronic acid before a rich ceramide moisturizer"
    ],
    high: [
      "Maintain your current balanced, protective skincare routine",
      "Stay consistently hydrated to sustain dermal cellular elasticity",
      "Schedule annual preventative dermatological barrier assessments"
    ]
  },
  hair: {
    always: [
      "Style with natural volume on top to balance facial vertical proportions",
      "Use lightweight matte texturizing cream rather than heavy pomades",
      "Schedule regular structural trims every 4–6 weeks"
    ]
  },
  style: {
    always: [
      "Choose structured, well-tailored collars aligned with your jawline",
      "Opt for clean, minimalist accessories that accentuate facial symmetry",
      "Wear open or spread necklines that complement your face shape"
    ]
  },
  posture: {
    jawlineLow: [
      "Practice chin tuck exercises daily to tone and define the mandibular margin",
      "Avoid forward head posture when using phones or laptops"
    ],
    jawlineGood: [
      "Maintain an upright neutral cervical spine to emphasize jawline sharpness",
      "Keep shoulders gently relaxed and set back to lengthen neck contours"
    ],
    symmetryLow: [
      "Be conscious of unilateral shoulder tension or cradling phones",
      "Sleep primarily on your back with ergonomic cervical support"
    ],
    symmetryGood: [
      "Maintain balanced bilateral chewing to keep masseter muscles even",
      "Continue neutral spinal alignment during seated desk hours"
    ]
  }
};

function generateImpression(attributes, ratingBadge) {
  const sorted = [...attributes].sort((a, b) => b.score - a.score);
  const top1 = sorted[0];
  const top2 = sorted[1];
  const weakest = sorted[sorted.length - 1];

  return `Your facial architecture displays exceptional ${top1.name.toLowerCase()} (${top1.score.toFixed(1)}/10) alongside strong ${top2.name.toLowerCase()} (${top2.score.toFixed(1)}/10). The synthesized neoclassical canons reflect ${ratingBadge.toLowerCase()} structural harmony. Targeted refinement in ${weakest.name.toLowerCase()} and focused grooming habits will further elevate your natural aesthetic presentation.`;
}

function generateStrengths(attributes) {
  const high = attributes
    .filter(a => a.score >= 7.5)
    .sort((a, b) => b.score - a.score);

  if (high.length >= 3) {
    return high.slice(0, 5).map(a => `Strong ${a.name.toLowerCase()} (${a.score.toFixed(1)}/10)`);
  }

  const sorted = [...attributes].sort((a, b) => b.score - a.score);
  return sorted.slice(0, 4).map(a => `Balanced ${a.name.toLowerCase()} (${a.score.toFixed(1)}/10)`);
}

function generateImprovements(attributes) {
  const low = attributes
    .filter(a => a.score < 7.0)
    .sort((a, b) => a.score - b.score);

  if (low.length >= 3) {
    return low.slice(0, 5).map(a => `${a.name} could improve (${a.score.toFixed(1)}/10)`);
  }

  const sorted = [...attributes].sort((a, b) => a.score - b.score);
  const items = low.map(a => `${a.name} could improve (${a.score.toFixed(1)}/10)`);
  for (const a of sorted) {
    const str = `${a.name} refinement potential (${a.score.toFixed(1)}/10)`;
    if (!items.includes(`${a.name} could improve (${a.score.toFixed(1)}/10)`) && !items.includes(str)) {
      items.push(str);
    }
    if (items.length >= 3) break;
  }
  return items.slice(0, 4);
}

function generateGroomingTips(metrics) {
  const skinKey = metrics.skinVitalityScore >= 7.0 ? 'high' : 'low';
  const jawKey = metrics.jawlineScore >= 7.0 ? 'jawlineGood' : 'jawlineLow';
  const symKey = metrics.symmetryScore >= 7.0 ? 'symmetryGood' : 'symmetryLow';

  return {
    skin: [...TIPS.skin[skinKey]],
    hair: [...TIPS.hair.always],
    style: [...TIPS.style.always],
    posture: [
      TIPS.posture[jawKey][0],
      TIPS.posture[symKey][0]
    ]
  };
}

export function buildResultFromLandmarks(landmarks, realAge, realGender, detection, brightnessStdDev = 15) {
  const pts = landmarks;

  let sumX = 0;
  for (let i = 0; i < pts.length; i++) sumX += pts[i].x;
  const midlineX = sumX / pts.length;
  const faceWidth = Math.max(1, Math.abs(pts[16].x - pts[0].x));
  const faceHeight = Math.max(1, Math.abs(pts[8].y - pts[27].y));

  const ageVal = Math.max(1, Math.round(realAge));
  // Create a range of 3-4 years centered on detected age
  const ageLow = Math.max(1, Math.round(realAge) - 2);
  const ageHigh = Math.max(ageLow + 3, Math.round(realAge) + 3);
  const ageRangeDisplay = `${ageLow} – ${ageHigh}`;
  const genderStr = realGender || 'unspecified';
  const isMale = genderStr.toLowerCase() === 'male';

  const faceShape = getFaceShape(pts);
  const symmetryScore = calcSymmetry(pts, faceWidth, midlineX);
  const proportionsScore = calcProportions(pts, detection);
  const jawlineData = calcJawline(pts);
  const jawlineScore = jawlineData.score;
  const cheekboneScore = calcCheekbones(pts);
  const eyeBalanceScore = calcEyeBalance(pts, faceWidth, midlineX);
  const noseBalanceScore = calcNoseBalance(pts, faceWidth, faceHeight);
  const lipProportionScore = calcLipProportion(pts);
  const boneStructureScore = calcBoneStructure(pts, jawlineScore, cheekboneScore, faceHeight);
  const skinVitalityScore = calcSkinVitality(ageVal, brightnessStdDev);
  const masculinityIndex = calcMasculinity(pts, genderStr, jawlineData.angle, faceWidth);
  const youthfulnessScore = calcYouthfulness(ageVal);

  // Overall Score (weighted average of 10 attributes)
  const weightedSum = (
    symmetryScore * 0.15 +
    proportionsScore * 0.15 +
    jawlineScore * 0.12 +
    cheekboneScore * 0.12 +
    eyeBalanceScore * 0.12 +
    noseBalanceScore * 0.10 +
    lipProportionScore * 0.08 +
    boneStructureScore * 0.08 +
    skinVitalityScore * 0.08
  );
  const overallScore = clamp(round1(weightedSum), 2.0, 10.0);

  const ratingBadge = overallScore >= 9.0
    ? 'EXCELLENT'
    : overallScore >= 7.5
    ? 'ABOVE AVERAGE'
    : overallScore >= 6.0
    ? 'GOOD'
    : overallScore >= 4.0
    ? 'AVERAGE'
    : 'FAIR';

  const attributes = [
    { name: 'Facial Symmetry', score: symmetryScore },
    { name: 'Facial Proportions', score: proportionsScore },
    { name: 'Jawline Definition', score: jawlineScore },
    { name: 'Cheekbone Prominence', score: cheekboneScore },
    { name: 'Eye Balance', score: eyeBalanceScore },
    { name: 'Nose Balance', score: noseBalanceScore },
    { name: 'Lip Proportion', score: lipProportionScore },
    { name: 'Bone Structure', score: boneStructureScore },
    { name: 'Skin Vitality', score: skinVitalityScore },
    { name: isMale ? 'Masculinity Index' : 'Femininity Index', score: masculinityIndex }
  ];

  const overallImpression = generateImpression(attributes, ratingBadge);
  const strengths = generateStrengths(attributes);
  const improvements = generateImprovements(attributes);
  const groomingTips = generateGroomingTips({ skinVitalityScore, jawlineScore, symmetryScore });

  return {
    estimatedAgeRange: ageRangeDisplay,
    gender: genderStr,
    faceShape,
    overallImpression,
    overallScore,
    ratingBadge,
    symmetryScore,
    proportionsScore,
    jawlineScore,
    cheekboneScore,
    eyeBalanceScore,
    noseBalanceScore,
    lipProportionScore,
    boneStructureScore,
    skinVitalityScore,
    masculinityIndex,
    youthfulnessScore,
    strengths,
    improvements,
    groomingTips
  };
}

// Run Full Face Analysis
export async function runFullFaceAnalysis(imageDataUrl) {
  currentImageBase64 = imageDataUrl;
  hideClarityError();

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

    const clarity = validateClientClarity(testImg);
    if (!clarity.valid) {
      showClarityError(clarity.error);
      return;
    }

    const inputArea = document.getElementById('analyzerInputArea');
    const resultDash = document.getElementById('resultDashboard');
    const scanOverlay = document.getElementById('scanningOverlay');
    const scanImg = document.getElementById('scanningImgPreview');

    if (inputArea) inputArea.style.display = 'none';
    if (resultDash) resultDash.style.display = 'none';
    if (scanOverlay) scanOverlay.style.display = 'block';
    if (scanImg) scanImg.src = imageDataUrl;

    setTimeout(() => {
      if (scanOverlay) {
        scanOverlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    const stepText = document.getElementById('scanStepText');
    if (stepText) stepText.textContent = 'Detecting facial coordinates and 68 landmarks...';

    try {
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

      const landmarks = detection.landmarks.positions;
      const realAge = Math.round(detection.age);
      const realGender = detection.gender;

      currentRealLandmarks = landmarks;
      currentDetectionBox = detection.detection.box;

      const brightnessStdDev = computeImageBrightnessStdDev(testImg);
      const result = buildResultFromLandmarks(landmarks, realAge, realGender, detection, brightnessStdDev);
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

// Display Results
function displayAnalysisResults(data, imgDataUrl) {
  if (!data) {
    showClarityError('Analysis could not be completed. Please try again.');
    return;
  }
  currentAnalysisData = data;

  document.getElementById('scanningOverlay')?.style.setProperty('display', 'none');
  const resultDash = document.getElementById('resultDashboard');
  if (resultDash) resultDash.style.display = 'block';

  // 1. Photo
  const photo = document.getElementById('reportPhoto');
  if (photo) photo.src = imgDataUrl;

  // 2. Basic info
  const ageRangeEl = document.getElementById('reportAgeRange');
  if (ageRangeEl) ageRangeEl.textContent = currentAnalysisData.estimatedAgeRange;

  const genderEl = document.getElementById('reportGender');
  if (genderEl) genderEl.textContent = data.gender.charAt(0).toUpperCase() + data.gender.slice(1);

  const faceShapeEl = document.getElementById('reportFaceShape');
  if (faceShapeEl) faceShapeEl.textContent = data.faceShape;

  const impressionEl = document.getElementById('reportImpression');
  if (impressionEl) impressionEl.textContent = data.overallImpression;

  // 3. Overall Score & Ring
  const overallScoreEl = document.getElementById('reportOverallScore');
  if (overallScoreEl) overallScoreEl.textContent = data.overallScore.toFixed(1);

  const badgeEl = document.getElementById('reportRatingBadge');
  if (badgeEl) badgeEl.textContent = data.ratingBadge;

  const ringFill = document.getElementById('reportRingFill');
  if (ringFill) {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const offset = Math.max(0, circumference - (data.overallScore / 10) * circumference);
    ringFill.style.strokeDasharray = `${circumference}`;
    ringFill.style.strokeDashoffset = `${circumference}`;
    setTimeout(() => {
      ringFill.style.strokeDashoffset = `${offset}`;
    }, 50);
  }

  // 4. Attribute Bars (10)
  const setBar = (valId, barId, score) => {
    const valEl = document.getElementById(valId);
    const barEl = document.getElementById(barId);
    if (valEl) valEl.textContent = score.toFixed(1);
    if (barEl) {
      barEl.style.width = '0%';
      setTimeout(() => {
        barEl.style.width = `${Math.min(100, Math.max(0, score * 10))}%`;
      }, 50);
    }
  };

  setBar('reportSymmetry', 'reportSymmetryBar', data.symmetryScore);
  setBar('reportProportions', 'reportProportionsBar', data.proportionsScore);
  setBar('reportJawline', 'reportJawlineBar', data.jawlineScore);
  setBar('reportCheekbones', 'reportCheekbonesBar', data.cheekboneScore);
  setBar('reportEyeBalance', 'reportEyeBalanceBar', data.eyeBalanceScore);
  setBar('reportNoseBalance', 'reportNoseBalanceBar', data.noseBalanceScore);
  setBar('reportLipProportion', 'reportLipProportionBar', data.lipProportionScore);
  setBar('reportBoneStructure', 'reportBoneStructureBar', data.boneStructureScore);
  setBar('reportSkinVitality', 'reportSkinVitalityBar', data.skinVitalityScore);

  const genderLabel = document.getElementById('reportGenderIndexLabel');
  if (genderLabel) {
    genderLabel.textContent = (data.gender || '').toLowerCase() === 'female' ? 'Femininity Index' : 'Masculinity Index';
  }
  setBar('reportMasculinity', 'reportMasculinityBar', data.masculinityIndex);

  // 5. Strengths & Improvements Lists
  const strengthsList = document.getElementById('reportStrengthsList');
  if (strengthsList && data.strengths) {
    strengthsList.innerHTML = data.strengths.map(s => `<li>${s}</li>`).join('');
  }

  const improvementsList = document.getElementById('reportImprovementsList');
  if (improvementsList && data.improvements) {
    improvementsList.innerHTML = data.improvements.map(i => `<li>${i}</li>`).join('');
  }

  // 6. Grooming Tips
  const skinTips = document.getElementById('reportSkinTips');
  if (skinTips && data.groomingTips?.skin) {
    skinTips.innerHTML = data.groomingTips.skin.map(t => `<li>${t}</li>`).join('');
  }

  const hairTips = document.getElementById('reportHairTips');
  if (hairTips && data.groomingTips?.hair) {
    hairTips.innerHTML = data.groomingTips.hair.map(t => `<li>${t}</li>`).join('');
  }

  const styleTips = document.getElementById('reportStyleTips');
  if (styleTips && data.groomingTips?.style) {
    styleTips.innerHTML = data.groomingTips.style.map(t => `<li>${t}</li>`).join('');
  }

  const postureTips = document.getElementById('reportPostureTips');
  if (postureTips && data.groomingTips?.posture) {
    postureTips.innerHTML = data.groomingTips.posture.map(t => `<li>${t}</li>`).join('');
  }

  // 7. Date
  const dateEl = document.getElementById('reportDate');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = `Generated on ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  }

  // 8. Smooth scroll
  setTimeout(() => {
    const reportEl = document.getElementById('beautyReport');
    if (reportEl) {
      reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 250);
}

export function resetAnalyzer() {
  const resultDash = document.getElementById('resultDashboard');
  const inputArea = document.getElementById('analyzerInputArea');
  const errorCard = document.getElementById('clarityErrorCard');

  if (resultDash) resultDash.style.display = 'none';
  if (inputArea) inputArea.style.display = 'block';
  if (errorCard) errorCard.style.display = 'none';

  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';

  if (webcamStream && webcamStream.active) {
    const video = document.getElementById('webcamVideo');
    const cameraCont = document.getElementById('cameraContainer');
    const cameraActiveArea = document.getElementById('cameraActiveArea');
    const uploadCont = document.getElementById('uploadContainer');
    const tabUpload = document.getElementById('tabUpload');
    const tabCamera = document.getElementById('tabCamera');
    const permPrompt = document.getElementById('cameraPermissionPrompt');

    if (cameraCont && cameraActiveArea && video) {
      if (uploadCont) uploadCont.style.display = 'none';
      if (cameraCont) cameraCont.style.display = 'block';
      if (tabUpload) tabUpload.classList.remove('active');
      if (tabCamera) tabCamera.classList.add('active');

      if (permPrompt) permPrompt.style.display = 'none';
      cameraActiveArea.style.display = 'block';

      if (video.srcObject !== webcamStream) {
        video.srcObject = webcamStream;
      }

      setTimeout(() => {
        try {
          if (video.paused) {
            video.play().catch(() => {});
          }
        } catch (_) {}

        if (video.readyState >= 2) {
          startAutoDetection();
        } else {
          video.onloadedmetadata = () => startAutoDetection();
        }

        const pill = document.getElementById('cameraAlignmentPill');
        const statusText = document.getElementById('cameraStatusText');
        if (pill) pill.classList.remove('aligned');
        if (statusText) statusText.textContent = 'Align your face inside the grid';
      }, 250);
    }
  }

  setTimeout(() => {
    const cameraActiveArea = document.getElementById('cameraActiveArea');
    const analyzer = document.getElementById('analyzer');

    if (cameraActiveArea && cameraActiveArea.style.display !== 'none' && webcamStream && webcamStream.active) {
      const rect = cameraActiveArea.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const elementHeight = rect.height;
      const viewportHeight = window.innerHeight;
      const targetY = scrollTop + rect.top - (viewportHeight / 2) + (elementHeight / 2);

      window.scrollTo({
        top: Math.max(0, targetY),
        behavior: 'smooth'
      });
    } else if (analyzer) {
      analyzer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 400);
}

// Unified Download Report Card Function (Manual Canvas 2D Rendering)
export async function downloadReportCard() {
  const data = currentAnalysisData;
  if (!data) {
    showToast('Please analyze a photo first.');
    return;
  }

  showToast('Preparing download...');

  // Wait for fonts to be ready
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) {}
  }

  // Create or retrieve high-resolution canvas
  const canvas = document.getElementById('downloadCardCanvas') || document.createElement('canvas');
  const W = 1200;
  const H = 1650;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    showToast('Canvas rendering context not available.');
    return;
  }

  // Helper: Rounded Rectangle
  function drawRoundRect(c, x, y, w, h, r) {
    if (typeof c.roundRect === 'function') {
      c.beginPath();
      c.roundRect(x, y, w, h, r);
      return;
    }
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // Helper: Text Wrapping
  function wrapText(c, text, x, y, maxWidth, lineHeight) {
    if (!text) return y;
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = c.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        c.fillText(line.trim(), x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    c.fillText(line.trim(), x, currentY);
    return currentY + lineHeight;
  }

  // ============ BACKGROUND & FRAME ============
  ctx.fillStyle = '#f8f6f2';
  ctx.fillRect(0, 0, W, H);

  // Outer border frame
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, W - 60, H - 60);

  // ============ HEADER STRIP ============
  ctx.fillStyle = '#6b6b6b';
  ctx.font = '600 13px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('FACIAL BEAUTY REPORT', 60, 78);
  ctx.textAlign = 'right';
  ctx.fillText('ANALYSIS  ·  INSIGHTS  ·  RECOMMENDATIONS', W - 60, 78);
  ctx.textAlign = 'left';

  // Header Divider
  ctx.strokeStyle = '#e5e2dc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 98);
  ctx.lineTo(W - 60, 98);
  ctx.stroke();

  // ============ TITLE & SUBTITLE ============
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '600 40px "Playfair Display", Georgia, serif';
  ctx.fillText('Your Facial Beauty Report', 60, 152);

  ctx.fillStyle = '#888888';
  ctx.font = '600 12px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('REAL FEATURES  ·  OBJECTIVE ANALYSIS', 60, 180);

  // ============ SECTION 1: PHOTO + BASIC INFO ============
  const photoX = 60;
  const photoY = 215;
  const photoW = 200;
  const photoH = 250;

  // Placeholder background for photo
  ctx.fillStyle = '#ebe7e0';
  ctx.fillRect(photoX, photoY, photoW, photoH);

  // Load and draw photo
  const photoSrc = currentImageBase64 || document.getElementById('reportPhoto')?.src;
  if (photoSrc) {
    await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const iw = img.naturalWidth || img.width || photoW;
          const ih = img.naturalHeight || img.height || photoH;
          const targetAspect = photoW / photoH;
          let sx = 0, sy = 0, sWidth = iw, sHeight = ih;
          if (iw / ih > targetAspect) {
            sWidth = ih * targetAspect;
            sx = (iw - sWidth) / 2;
          } else {
            sHeight = iw / targetAspect;
            sy = (ih - sHeight) / 2;
          }
          ctx.drawImage(img, sx, sy, sWidth, sHeight, photoX, photoY, photoW, photoH);
        } catch (_) {}
        resolve();
      };
      img.onerror = () => resolve();
      img.src = photoSrc;
      if (img.complete && img.naturalWidth !== 0) {
        img.onload();
      }
    });
  }

  // Photo border
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(photoX, photoY, photoW, photoH);

  // Right Column: Basic Information
  const infoX = 290;
  ctx.fillStyle = '#888888';
  ctx.font = '700 12px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('BASIC INFORMATION', infoX, 230);

  // Info details line
  ctx.fillStyle = '#555555';
  ctx.font = '500 13px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Estimated Age:', infoX, 258);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '700 14px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(data.estimatedAgeRange || '—', infoX + 110, 258);

  ctx.fillStyle = '#555555';
  ctx.font = '500 13px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Gender:', infoX + 270, 258);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '700 14px "Inter", "Plus Jakarta Sans", sans-serif';
  const genderFormatted = data.gender ? (data.gender.charAt(0).toUpperCase() + data.gender.slice(1)) : '—';
  ctx.fillText(genderFormatted, infoX + 335, 258);

  ctx.fillStyle = '#555555';
  ctx.font = '500 13px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Face Shape:', infoX + 510, 258);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '700 14px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(data.faceShape || '—', infoX + 600, 258);

  // Divider inside info box
  ctx.strokeStyle = '#e5e2dc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(infoX, 282);
  ctx.lineTo(W - 60, 282);
  ctx.stroke();

  // Overall Impression
  ctx.fillStyle = '#888888';
  ctx.font = '700 12px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('OVERALL IMPRESSION', infoX, 310);

  ctx.fillStyle = '#2d2d2d';
  ctx.font = '400 13px "Inter", "Plus Jakarta Sans", sans-serif';
  wrapText(ctx, data.overallImpression, infoX, 335, W - 60 - infoX, 22);

  // Section 1 Divider
  ctx.strokeStyle = '#e5e2dc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 485);
  ctx.lineTo(W - 60, 485);
  ctx.stroke();

  // ============ SECTION 2: OVERALL SCORE & ATTRIBUTES ============
  // Left: Score Ring & Badge
  const ringX = 190;
  const ringY = 605;
  const ringRadius = 55;

  // Track circle
  ctx.strokeStyle = '#e5e2dc';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(ringX, ringY, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Progress fill circle
  const scoreRatio = Math.min(1, Math.max(0, data.overallScore / 10));
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(ringX, ringY, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * scoreRatio);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Number inside ring
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '700 36px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.overallScore.toFixed(1), ringX, ringY + 8);
  ctx.fillStyle = '#888888';
  ctx.font = '600 13px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('/ 10', ringX, ringY + 30);

  // Rating Badge Pill
  const badgeText = data.ratingBadge || 'ABOVE AVERAGE';
  ctx.font = '700 12px "Inter", "Plus Jakarta Sans", sans-serif';
  const badgeWidth = ctx.measureText(badgeText).width + 26;
  const badgeHeight = 26;
  ctx.fillStyle = '#1a1a1a';
  drawRoundRect(ctx, ringX - badgeWidth / 2, ringY + ringRadius + 22, badgeWidth, badgeHeight, 13);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(badgeText, ringX, ringY + ringRadius + 39);

  // Score description text
  ctx.fillStyle = '#666666';
  ctx.font = '400 12px "Inter", "Plus Jakarta Sans", sans-serif';
  wrapText(ctx, 'Comprehensive cephalometric score synthesizing 10 neoclassical biometric canons.', 60, ringY + ringRadius + 70, 260, 18);
  ctx.textAlign = 'left';

  // Right: Attribute Breakdown (10 bars)
  const attrsX = 390;
  ctx.fillStyle = '#888888';
  ctx.font = '700 12px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('ATTRIBUTE BREAKDOWN', attrsX, 515);

  const isFemale = (data.gender || '').toLowerCase() === 'female';
  const attrList = [
    { label: 'Facial Symmetry', val: data.symmetryScore },
    { label: 'Facial Proportions', val: data.proportionsScore },
    { label: 'Jawline Definition', val: data.jawlineScore },
    { label: 'Cheekbone Prominence', val: data.cheekboneScore },
    { label: 'Eye Balance', val: data.eyeBalanceScore },
    { label: 'Nose Balance', val: data.noseBalanceScore },
    { label: 'Lip Proportion', val: data.lipProportionScore },
    { label: 'Bone Structure', val: data.boneStructureScore },
    { label: 'Skin Vitality', val: data.skinVitalityScore },
    { label: isFemale ? 'Femininity Index' : 'Masculinity Index', val: data.masculinityIndex }
  ];

  const barStartX = attrsX + 220;
  const barWidth = 440;
  const barHeight = 8;

  attrList.forEach((attr, idx) => {
    const rowY = 545 + idx * 32;

    // Label
    ctx.fillStyle = '#2d2d2d';
    ctx.font = '500 13px "Inter", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(attr.label, attrsX, rowY);

    // Track
    const barY = rowY - 9;
    ctx.fillStyle = '#e5e2dc';
    drawRoundRect(ctx, barStartX, barY, barWidth, barHeight, 4);
    ctx.fill();

    // Fill
    const fillWidth = Math.max(0, Math.min(barWidth, barWidth * (attr.val / 10)));
    ctx.fillStyle = '#1a1a1a';
    drawRoundRect(ctx, barStartX, barY, fillWidth, barHeight, 4);
    ctx.fill();

    // Value
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '700 13px "Inter", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(attr.val.toFixed(1), barStartX + barWidth + 55, rowY);
    ctx.textAlign = 'left';
  });

  // Section 2 Divider
  ctx.strokeStyle = '#e5e2dc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 885);
  ctx.lineTo(W - 60, 885);
  ctx.stroke();

  // ============ SECTION 3: STRENGTHS & IMPROVEMENTS ============
  // Left: Strengths
  ctx.fillStyle = '#2e7d32';
  ctx.font = '700 13px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('STRENGTHS', 60, 915);

  ctx.fillStyle = '#2d2d2d';
  ctx.font = '400 13px "Inter", "Plus Jakarta Sans", sans-serif';
  if (data.strengths && data.strengths.length) {
    data.strengths.slice(0, 4).forEach((str, i) => {
      ctx.fillText(`✓   ${str}`, 60, 942 + i * 26);
    });
  }

  // Right: Areas for Improvement
  ctx.fillStyle = '#c62828';
  ctx.font = '700 13px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('AREAS FOR IMPROVEMENT', 620, 915);

  ctx.fillStyle = '#2d2d2d';
  ctx.font = '400 13px "Inter", "Plus Jakarta Sans", sans-serif';
  if (data.improvements && data.improvements.length) {
    data.improvements.slice(0, 4).forEach((imp, i) => {
      ctx.fillText(`○   ${imp}`, 620, 942 + i * 26);
    });
  }

  // Section 3 Divider
  ctx.strokeStyle = '#e5e2dc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 1070);
  ctx.lineTo(W - 60, 1070);
  ctx.stroke();

  // ============ SECTION 4: GROOMING RECOMMENDATIONS ============
  ctx.fillStyle = '#888888';
  ctx.font = '700 13px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('PERSONALIZED GROOMING RECOMMENDATIONS', 60, 1100);

  const tipsCols = [
    { title: '1. SKINCARE', tips: data.groomingTips?.skin || [], x: 60 },
    { title: '2. HAIR & GROOMING', tips: data.groomingTips?.hair || [], x: 340 },
    { title: '3. STYLE & WARDROBE', tips: data.groomingTips?.style || [], x: 620 },
    { title: '4. POSTURE & HARMONY', tips: data.groomingTips?.posture || [], x: 900 }
  ];

  tipsCols.forEach((col) => {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '700 12px "Inter", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(col.title, col.x, 1132);

    ctx.fillStyle = '#444444';
    ctx.font = '400 12px "Inter", "Plus Jakarta Sans", sans-serif';
    let tipY = 1158;
    col.tips.slice(0, 3).forEach((tip) => {
      tipY = wrapText(ctx, `• ${tip}`, col.x, tipY, 235, 17) + 6;
    });
  });

  // Section 4 Divider
  ctx.strokeStyle = '#e5e2dc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 1555);
  ctx.lineTo(W - 60, 1555);
  ctx.stroke();

  // ============ SECTION 5: FOOTER ============
  ctx.fillStyle = '#6b6b6b';
  ctx.font = '700 12px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.fillText('TOOL GENIE · BIOMETRIC ANALYSIS', 60, 1590);

  const now = new Date();
  const dateStr = `Generated on ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  ctx.fillStyle = '#888888';
  ctx.font = '500 12px "Inter", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, W - 60, 1590);
  ctx.textAlign = 'left';

  // ============ EXPORT TO PNG ============
  try {
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `tool-genie-beauty-report-${Date.now()}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Report downloaded successfully!');
  } catch (err) {
    console.error('Download export failed:', err);
    showToast('Could not export canvas. Please try again.');
  }
}

// Global window bindings
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.openContactModal = openContactModal;
window.closeContactModal = closeContactModal;
window.handleContactSubmit = handleContactSubmit;
window.switchInputMode = switchInputMode;
window.requestCameraAccess = requestCameraAccess;
window.switchCamera = switchCamera;
window.captureLiveSnapshot = captureLiveSnapshot;
window.retryScan = retryScan;
window.handleFileSelect = handleFileSelect;
window.loadSample = loadSample;
window.resetAnalyzer = resetAnalyzer;
window.stopWebcam = stopWebcam;
window.downloadReportCard = downloadReportCard;
window.downloadAnalysisCard = downloadReportCard;
window.loadFaceModels = loadFaceModels;
window.buildResultFromLandmarks = buildResultFromLandmarks;
window.runFullFaceAnalysis = runFullFaceAnalysis;
