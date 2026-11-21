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
    const share = $('shareFriendQr'), shareStatus = $('friendQrShareStatus');
    if (![dialog, show, scan, display, scanner, video, status, camera, stop, photo, file, share, shareStatus].every(Boolean)) return;
    video.classList.add('hidden');
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
      video.classList.add('hidden');
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
        video.classList.remove('hidden');
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
    // Share a PNG containing ONLY the public device code. Build the image
    // synchronously in the click handler: iOS Safari requires user activation
    // to survive until navigator.share() opens the system share sheet.
    function friendQrPng(code) {
      if (typeof window.qrcode !== 'function') throw new Error('QR generator unavailable');
      const qr = window.qrcode(0, 'M');
      qr.addData(code);
      qr.make();
      const quiet = 4, cell = 12, modules = qr.getModuleCount();
      const pixels = (modules + quiet * 2) * cell;
      const output = document.createElement('canvas');
      output.width = output.height = pixels;
      const pen = output.getContext('2d');
      if (!pen) throw new Error('Canvas unavailable');
      pen.fillStyle = '#ffffff';
      pen.fillRect(0, 0, pixels, pixels);
      pen.fillStyle = '#000000';
      for (let row = 0; row < modules; row++) {
        for (let col = 0; col < modules; col++) {
          if (qr.isDark(row, col)) pen.fillRect((col + quiet) * cell, (row + quiet) * cell, cell, cell);
        }
      }
      return output.toDataURL('image/png');
    }
    function pngBytes(dataUrl) {
      const prefix = 'data:image/png;base64,';
      if (!dataUrl.startsWith(prefix)) throw new Error('QR image encoding failed');
      const raw = atob(dataUrl.slice(prefix.length));
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes;
    }
    function saveQrPng(blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Droply-Friend-QR.png';
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }
    share.addEventListener('click', async () => {
      const code = codeFromQr($('shareCode').textContent);
      if (!code) {
        shareStatus.textContent = 'Your device code is still loading. Try again shortly.';
        return;
      }
      share.disabled = true;
      shareStatus.textContent = '';
      try {
        const dataUrl = friendQrPng(code);
        // Android's native app has its own ACTION_SEND chooser. Most WebViews
        // don't implement Web Share, so use its trusted bridge first.
        if (window.DroplyAndroid && typeof window.DroplyAndroid.shareQrImage === 'function') {
          const started = window.DroplyAndroid.shareQrImage(dataUrl, code);
          if (started) {
            shareStatus.textContent = 'Choose an app to share your QR image.';
            return;
          }
        }
        const bytes = pngBytes(dataUrl);
        const blob = new Blob([bytes], { type: 'image/png' });
        const image = new File([blob], 'Droply-Friend-QR.png', { type: 'image/png' });
        // File sharing is preferred to plain text: the recipient should get
        // the actual QR image they can scan, not just the DRP code.
        let canShareImage = false;
        if (typeof navigator.share === 'function') {
          try {
            canShareImage = typeof navigator.canShare !== 'function' ||
              navigator.canShare({ files: [image] });
          } catch (_) { canShareImage = false; }
        }
        if (canShareImage) {
          try {
            await navigator.share({
              files: [image],
              title: 'My Droply friend QR',
              text: 'Add me on Droply: ' + code
            });
            shareStatus.textContent = 'QR code shared.';
            return;
          } catch (error) {
            if (error && error.name === 'AbortError') return;
            // Fall back to a PNG image if file sharing was not supported.
          }
        }
        saveQrPng(blob);
        shareStatus.textContent = 'QR image saved. You can send it from any app.';
      } catch (_) {
        shareStatus.textContent = 'Sharing is unavailable here. You can still copy your device code.';
      } finally {
        share.disabled = false;
      }
    });
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
        let bitmap, release = () => {};
        if (typeof createImageBitmap === 'function') {
          bitmap = await createImageBitmap(imageFile);
          release = () => bitmap.close();
        } else {
          // Older WebViews and Safari versions can decode via an image element.
          const url = URL.createObjectURL(imageFile);
          release = () => URL.revokeObjectURL(url);
          try {
            bitmap = await new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = () => reject(new Error('Invalid image'));
              image.src = url;
            });
          } catch (error) {
            release();
            throw error;
          }
        }
        try {
          const code = decodeFrame(bitmap, bitmap.naturalWidth || bitmap.width, bitmap.naturalHeight || bitmap.height);
          if (!code) message('No QR code found in the image. Try a clearer photo.');
          else applyScan(code);
        } finally { release(); }
      } catch (_) {
        message('Unable to read the image. Try another photo or enter the code manually.');
      }
    });
    // Always release the camera when a popup closes or the tab is backgrounded.
    // The QR section changes popup height after initial positioning.
    // Re-run the existing anchored layout on open/close; it also handles
    // orientation changes. Limit notifications to one animation frame.
    let layoutFrame = 0;
    function requestLayout() {
      if (layoutFrame) return;
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = 0;
        if (!dialog.classList.contains('hidden')) window.dispatchEvent(new Event('resize'));
      });
    }
    const layoutObserver = new MutationObserver(requestLayout);
    layoutObserver.observe(display, { attributes: true, attributeFilter: ['class'] });
    layoutObserver.observe(scanner, { attributes: true, attributeFilter: ['class'] });
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
