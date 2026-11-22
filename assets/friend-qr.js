/* Optional friend QR pairing. The QR contains only a public DRP device code.
   Scanning fills the existing friend-code field; the user still confirms Add.
   Libraries are bundled locally and no scan data is uploaded. */
(() => {
  'use strict';
  const CODE = /^DRP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
  const $ = id => document.getElementById(id);
  function qrSvg(code) {
    if (!CODE.test(String(code || '').trim().toUpperCase()) || typeof window.qrcode !== 'function') throw new Error('Invalid friend code');
    const qr = window.qrcode(0, 'M');
    qr.addData(String(code).trim().toUpperCase());
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 5, scalable: true });
  }
  function qrPng(code) {
    if (!CODE.test(String(code || '').trim().toUpperCase()) || typeof window.qrcode !== 'function') throw new Error('Invalid friend code');
    const qr = window.qrcode(0, 'M');
    qr.addData(String(code).trim().toUpperCase());
    qr.make();
    const quiet = 4, cell = 12, modules = qr.getModuleCount(), pixels = (modules + quiet * 2) * cell;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = pixels;
    const pen = canvas.getContext('2d');
    if (!pen) throw new Error('Canvas unavailable');
    pen.fillStyle = '#fff'; pen.fillRect(0, 0, pixels, pixels); pen.fillStyle = '#000';
    for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) pen.fillRect((col + quiet) * cell, (row + quiet) * cell, cell, cell);
    }
    return canvas.toDataURL('image/png');
  }
  function pngBytes(dataUrl) {
    const prefix = 'data:image/png;base64,';
    if (!dataUrl.startsWith(prefix)) throw new Error('QR image encoding failed');
    const raw = atob(dataUrl.slice(prefix.length)), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
  function saveQrPng(blob, filename = 'Droply-Friend-QR.png') {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; link.hidden = true;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  async function copyQr(code) {
    const dataUrl = qrPng(code);
    if (window.DroplyAndroid && typeof window.DroplyAndroid.copyQrImage === 'function') return !!window.DroplyAndroid.copyQrImage(dataUrl, code);
    if (window.api && typeof window.api.copyImage === 'function') return !!(await window.api.copyImage(dataUrl));
    if (navigator.clipboard?.write && typeof ClipboardItem === 'function') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([pngBytes(dataUrl)], { type: 'image/png' }) })]);
      return true;
    }
    return false;
  }
  function saveQr(code) {
    const dataUrl = qrPng(code);
    if (window.DroplyAndroid && typeof window.DroplyAndroid.saveQrImage === 'function') return !!window.DroplyAndroid.saveQrImage(dataUrl, code);
    saveQrPng(new Blob([pngBytes(dataUrl)], { type: 'image/png' }));
    return true;
  }
  // Reused by the accepted-friend profile card and Add Friend dialog.
  window.DroplyFriendQR = Object.freeze({ isValidCode: code => CODE.test(String(code || '').trim().toUpperCase()), svg: qrSvg, copy: copyQr, save: saveQr });
  function init() {
    const dialog = $('addFriend'), setup = $('setup');
    const show = $('showFriendQr'), scan = $('scanFriendQr');
    const display = $('friendQrPanel'), scanner = $('friendScanner');
    const video = $('friendQrVideo'), status = $('friendQrStatus');
    const camera = $('friendQrCamera'), stop = $('friendQrStop');
    const photo = $('friendQrPhoto'), file = $('friendQrFile');
    const copy = $('copyFriendQr'), save = $('saveFriendQr'), shareStatus = $('friendQrShareStatus');
    if (![dialog, show, scan, display, scanner, video, status, camera, stop, photo, file, copy, save, shareStatus].every(Boolean)) return;
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
    // synchronously from the click handler so clipboard and save actions can
    // use the browser's current user activation.
    function setBusy(button, busy) {
      button.disabled = busy;
      copy.disabled = busy;
      save.disabled = busy;
    }
    function currentQr() {
      const code = codeFromQr($('shareCode').textContent);
      if (!code) {
        shareStatus.textContent = 'Your device code is still loading. Try again shortly.';
        return null;
      }
      try { return { code, dataUrl: qrPng(code) }; }
      catch (_) { shareStatus.textContent = 'Could not create the QR image. Try again.'; return null; }
    }
    copy.addEventListener('click', async () => {
      const qr = currentQr();
      if (!qr) return;
      setBusy(copy, true);
      shareStatus.textContent = '';
      try {
        let copied = false;
        if (window.DroplyAndroid && typeof window.DroplyAndroid.copyQrImage === 'function') {
          copied = window.DroplyAndroid.copyQrImage(qr.dataUrl, qr.code);
        } else if (window.api && typeof window.api.copyImage === 'function') {
          copied = await window.api.copyImage(qr.dataUrl);
        } else if (navigator.clipboard?.write && typeof ClipboardItem === 'function') {
          const blob = new Blob([pngBytes(qr.dataUrl)], { type: 'image/png' });
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          copied = true;
        }
        shareStatus.textContent = copied ? 'QR image copied. Paste it into a message or document.' : 'Image clipboard is unavailable here. Use Save QR instead.';
      } catch (_) {
        shareStatus.textContent = 'Could not copy the QR image. Use Save QR instead.';
      } finally { setBusy(copy, false); }
    });
    save.addEventListener('click', () => {
      const qr = currentQr();
      if (!qr) return;
      setBusy(save, true);
      shareStatus.textContent = '';
      try {
        if (window.DroplyAndroid && typeof window.DroplyAndroid.saveQrImage === 'function') {
          const saved = window.DroplyAndroid.saveQrImage(qr.dataUrl, qr.code);
          shareStatus.textContent = saved ? 'QR image saved to Downloads.' : 'Could not save the QR image.';
        } else {
          saveQrPng(new Blob([pngBytes(qr.dataUrl)], { type: 'image/png' }));
          shareStatus.textContent = 'QR image saved as Droply-Friend-QR.png.';
        }
      } catch (_) {
        shareStatus.textContent = 'Could not save the QR image. Try again.';
      } finally { setBusy(save, false); }
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
        $('friendQrImage').innerHTML = qrSvg(code);
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
