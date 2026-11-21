/* Optional friend QR pairing. The QR contains only a public DRP device code.
   Scanning fills the existing friend-code field; the user still confirms Add.
   Libraries are bundled locally and no scan data is uploaded. */
(() => {
  'use strict';
  const CODE = /^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
  const $ = id => document.getElementById(id);
  function init() {
    const dialog = $('addFriend'), setup = $('setup');
    const show = $('showFriendQr'), scan = $('scanFriendQr');
    const display = $('friendQrPanel'), scanner = $('friendScanner');
    const video = $('friendQrVideo'), status = $('friendQrStatus');
    const camera = $('friendQrCamera'), stop = $('friendQrStop');
    const photo = $('friendQrPhoto'), file = $('friendQrFile');
    if (![dialog, show, scan, display, scanner, video, status, camera, stop, photo, file].every(Boolean)) return;
    let stream = null, frame = 0, busy = false, lastScan = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const message = text => { status.textContent = text; };
    const codeFromQr = text => {
      if (typeof text !== 'string') return null;
      const code = text.trim().toUpperCase();
      return CODE.test(code) ? code : null;
    };
    function closeCamera() {
      cancelAnimationFrame(frame);
      frame = 0; busy = false;
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = null;
      video.pause();
      video.srcObject = null;
      stop.classList.add('hidden');
      camera.classList.remove('hidden');
    }
    function hideScanner() {
      closeCamera();
      scanner.classList.add('hidden');
      scan.setAttribute('aria-expanded', 'false');
    }
    function decodeFrame(source, width, height) {
      if (!ctx || typeof window.jsQR !== 'function' || !width || !height) return null;
      const ratio = Math.min(1, 960 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })?.data || null;
    }
    function applyScan(raw) {
      const code = codeFromQr(raw);
      if (!code) {
        message('This is not a valid Droply friend QR code. Please try another.');
        return false;
      }
      const input = $('codeIn');
      input.value = code.slice(4);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      $('addMsg').textContent = 'QR scanned. Review the friend code and press Add to send a request.';
      $('addMsg').className = 'pk-msg good';
      hideScanner();
      display.classList.add('hidden');
      show.setAttribute('aria-expanded', 'false');
      input.focus();
      return true;
    }
    function scanFrame(time) {
      if (!stream || scanner.classList.contains('hidden') || dialog.classList.contains('hidden')) return closeCamera();
      frame = requestAnimationFrame(scanFrame);
      if (busy || time - lastScan < 180 || video.readyState < 2) return;
      lastScan = time;
      busy = true;
      try {
        const value = decodeFrame(video, video.videoWidth, video.videoHeight);
        if (value) applyScan(value);
      } catch (_) { message('Unable to read camera image. You can choose a QR photo instead.'); }
      finally { busy = false; }
    }
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        message('Camera scanning is unavailable here. Choose a saved QR photo or enter the code manually.');
        return;
      }
      closeCamera();
      message('Requesting camera permission…');
      try {
        const capture = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (scanner.classList.contains('hidden') || dialog.classList.contains('hidden')) {
          capture.getTracks().forEach(track => track.stop());
          return;
        }
        stream = capture;
        video.srcObject = stream;
        await video.play();
        camera.classList.add('hidden');
        stop.classList.remove('hidden');
        message('Point the camera at a Droply QR code.');
        frame = requestAnimationFrame(scanFrame);
      } catch (_) {
        closeCamera();
        message('Camera access was denied or unavailable. Choose a QR photo or enter the code manually.');
      }
    }
    show.addEventListener('click', () => {
      const opening = display.classList.contains('hidden');
      hideScanner();
      display.classList.toggle('hidden', !opening);
      show.setAttribute('aria-expanded', String(opening));
      if (!opening) return;
      const code = codeFromQr($('shareCode').textContent);
      if (!code || typeof window.qrcode !== 'function') {
        $('friendQrImage').textContent = 'Your device code is not ready yet.';
        return;
      }
      try {
        const qr = window.qrcode(0, 'M');
        qr.addData(code);
        qr.make();
        $('friendQrImage').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 5, scalable: true });
      } catch (_) {
        $('friendQrImage').textContent = 'Could not generate your QR code. You can still copy your device code.';
      }
    });
    scan.addEventListener('click', () => {
      const opening = scanner.classList.contains('hidden');
      display.classList.add('hidden');
      show.setAttribute('aria-expanded', 'false');
      if (!opening) return hideScanner();
      scanner.classList.remove('hidden');
      scan.setAttribute('aria-expanded', 'true');
      message('Start the camera or choose a photo containing a QR code.');
    });
    camera.addEventListener('click', startCamera);
    stop.addEventListener('click', () => { closeCamera(); message('Camera stopped.'); });
    photo.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const imageFile = file.files?.[0];
      file.value = '';
      if (!imageFile) return;
      if (!imageFile.type.startsWith('image/') || imageFile.size > 12 * 1024 * 1024) {
        message('Choose an image smaller than 12 MB.'); return;
      }
      try {
        const bitmap = await createImageBitmap(imageFile);
        try {
          const code = decodeFrame(bitmap, bitmap.width, bitmap.height);
          if (!code) message('No QR code found in the image. Try a clearer photo.');
          else applyScan(code);
        } finally { bitmap.close(); }
      } catch (_) {
        message('Unable to read the image. Try another photo or enter the code manually.');
      }
    });
    // Always release the camera when a popup closes or the tab is backgrounded.
    const observer = new MutationObserver(() => {
      if (dialog.classList.contains('hidden')) {
        hideScanner();
        display.classList.add('hidden');
        show.setAttribute('aria-expanded', 'false');
      }
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) closeCamera();
    });
    window.addEventListener('pagehide', closeCamera);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
