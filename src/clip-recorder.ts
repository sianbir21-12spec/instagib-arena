const MAX_RECORDING_MS = 15_000;
const BUTTON_ID = 'instagib-clip-record-button';

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stopTimer: number | null = null;
let button: HTMLButtonElement | null = null;

function setButton(recording: boolean) {
  if (!button) return;
  button.textContent = recording ? '■ SAVE CLIP' : '● RECORD CLIP';
  button.style.borderColor = recording ? 'rgba(248,113,113,.65)' : 'rgba(34,211,238,.35)';
  button.style.color = recording ? '#fca5a5' : '#67e8f9';
  button.style.boxShadow = recording
    ? '0 0 26px rgba(248,113,113,.18)'
    : '0 0 24px rgba(34,211,238,.12)';
}

function saveRecording() {
  if (!chunks.length) return;
  const blob = new Blob(chunks, { type: recorder?.mimeType || 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `instagib-clip-${stamp}.webm`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  chunks = [];
}

function stopRecording(save = true) {
  if (!recorder || recorder.state === 'inactive') return;
  if (stopTimer != null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
  const active = recorder;
  active.onstop = () => {
    if (save) saveRecording();
    setButton(false);
    recorder = null;
  };
  active.stop();
}

function startRecording(canvas: HTMLCanvasElement) {
  if (recorder?.state === 'recording') {
    stopRecording(true);
    return;
  }
  if (!('MediaRecorder' in window) || !canvas.captureStream) {
    window.alert('Clip recording is not supported by this browser. Try Chrome or Edge.');
    return;
  }

  const stream = canvas.captureStream(60);
  const preferred = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = preferred.find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) {
    window.alert('This browser does not support WebM clip recording.');
    stream.getTracks().forEach((track) => track.stop());
    return;
  }

  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onerror = () => {
    stream.getTracks().forEach((track) => track.stop());
    chunks = [];
    recorder = null;
    setButton(false);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    saveRecording();
    recorder = null;
    setButton(false);
  };
  recorder.start(250);
  setButton(true);

  // Automatically finish a clip after 15 seconds so a forgotten recording
  // cannot consume memory indefinitely. The player can save earlier with the
  // same button or Ctrl+Shift+R.
  stopTimer = window.setTimeout(() => stopRecording(true), MAX_RECORDING_MS);
}

function mount() {
  if (button || typeof document === 'undefined') return;
  const canvas = document.querySelector<HTMLCanvasElement>('canvas');
  if (!canvas) {
    window.setTimeout(mount, 500);
    return;
  }

  button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.title = 'Record a gameplay clip (Ctrl+Shift+R also works)';
  button.style.cssText = [
    'position:fixed', 'left:16px', 'top:16px', 'z-index:9998',
    'padding:9px 12px', 'border:1px solid rgba(34,211,238,.35)',
    'border-radius:8px', 'background:rgba(9,9,11,.82)', 'backdrop-filter:blur(8px)',
    'font:800 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace',
    'letter-spacing:.12em', 'text-transform:uppercase', 'color:#67e8f9',
    'cursor:pointer', 'box-shadow:0 0 24px rgba(34,211,238,.12)',
  ].join(';');
  button.addEventListener('click', () => startRecording(canvas));
  document.body.appendChild(button);
  setButton(false);

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyR') {
      event.preventDefault();
      startRecording(canvas);
    }
  });
}

// The canvas is created by the game after React mounts, so wait for it.
if (typeof window !== 'undefined') {
  window.setTimeout(mount, 0);
}
