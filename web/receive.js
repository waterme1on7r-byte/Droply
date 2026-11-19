(() => {
  'use strict';
  const transfers = new Map(), downloads = new Map();
  const MAX_BUFFERED = 64 * 1024 * 1024;
  const validTid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
  const safeName = name => {
    if (typeof name !== 'string' || !name || name.length > 1024 || name.startsWith('/')
      || name.includes('\\') || /[\u0000-\u001f]/.test(name)) throw Error('Unsafe filename');
    const segments = name.split('/');
    if (segments.some(x => !x || x === '.' || x === '..' || x.endsWith('.')
      || x.endsWith(' ') || /[<>:"|?*]/.test(x) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(x)))
      throw Error('Unsafe file path');
    return segments;
  };
  function failed(rec, message) {
    if (rec.cancelled) return;
    rec.cancelled = true;
    window.DroplyWebNetwork.emit('save-error', { tid: rec.tid, message });
    try { rec.writable?.abort(); } catch {}
  }
  async function prepareReceive(tid, files) {
    if (!validTid(tid) || transfers.has(tid) || transfers.size >= 10 || !Array.isArray(files)
      || !files.length || files.length > 1000) return false;
    const seen = new Set();
    let total = 0;
    const expected = files.map(file => {
      const path = safeName(file.name);
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 2 ** 40)
        throw Error('Invalid file size');
      total += file.size;
      if (total > 2 ** 40) throw Error('Transfer too large');
      const name = path.join('/');
      if (seen.has(name)) throw Error('Duplicate file paths');
      seen.add(name);
      return { name, size: file.size, path };
    });
    const rec = { tid, expected, next: 0, current: null, queue: Promise.resolve(),
      cancelled: false, mode: 'memory', bytes: 0 };
    if (window.isSecureContext && typeof window.showDirectoryPicker === 'function') {
      // This runs directly from the user's Accept gesture. Never write to a folder
      // before the user chooses it; put everything inside a unique child directory.
      let parent;
      try { parent = await window.showDirectoryPicker({ mode: 'readwrite' }); }
      catch (error) {
        if (error.name === 'AbortError') return false;
        throw error;
      }
      rec.parent = parent;
      rec.directoryName = 'Droply received ' + new Date().toISOString().replace(/[:.]/g, '-') +
        ' ' + crypto.randomUUID().slice(0, 8);
      rec.root = await parent.getDirectoryHandle(rec.directoryName, { create: true });
      rec.mode = 'disk';
    } else if (total > MAX_BUFFERED) {
      window.alert('This browser can receive up to 64 MB per transfer. Use Chrome or Edge to choose a save folder for larger files.');
      return false;
    }
    transfers.set(tid, rec);
    return true;
  }
  function saveOpen(tid, name, size) {
    const rec = transfers.get(tid);
    if (!rec || rec.cancelled || rec.current || rec.next >= rec.expected.length) return;
    const expected = rec.expected[rec.next];
    if (name !== expected.name || size !== expected.size) return failed(rec, 'File did not match the accepted offer');
    rec.next++;
    const current = { name, size, received: 0, parts: [] };
    rec.current = current;
    if (rec.mode === 'disk') {
      rec.queue = rec.queue.then(async () => {
        let dir = rec.root;
        for (const part of expected.path.slice(0, -1))
          dir = await dir.getDirectoryHandle(part, { create: true });
        const handle = await dir.getFileHandle(expected.path.at(-1), { create: true });
        current.writer = await handle.createWritable({ keepExistingData: false });
      }).catch(error => failed(rec, error.message || 'Unable to open incoming file'));
    }
  }
  function saveChunk(tid, bytes) {
    const rec = transfers.get(tid), current = rec?.current;
    if (!rec || rec.cancelled || !current) return;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > 256 * 1024
      || current.received + bytes.byteLength > current.size)
      return failed(rec, 'Incoming data exceeded the approved file size');
    if (rec.mode === 'memory' && rec.bytes + bytes.byteLength > MAX_BUFFERED)
      return failed(rec, 'Browser download buffer is full');
    current.received += bytes.byteLength;
    rec.bytes += rec.mode === 'memory' ? bytes.byteLength : 0;
    const chunk = bytes.slice(); // release the data channel's mutable buffer
    rec.queue = rec.queue.then(async () => {
      if (rec.cancelled) return;
      if (rec.mode === 'disk') await current.writer.write(chunk);
      else current.parts.push(chunk);
      if (!rec.cancelled) window.DroplyWebNetwork.emit('save-wrote', { tid, n: chunk.byteLength });
    }).catch(error => failed(rec, error.message || 'Could not save incoming bytes'));
  }
  function saveClose(tid) {
    const rec = transfers.get(tid), current = rec?.current;
    if (!rec || rec.cancelled || !current) return;
    if (current.received !== current.size) return failed(rec, 'Incomplete incoming file');
    rec.current = null;
    rec.queue = rec.queue.then(async () => {
      if (rec.cancelled) return;
      let path;
      if (rec.mode === 'disk') {
        await current.writer.close();
        current.writer = null;
      } else {
        const blob = new Blob(current.parts, { type: 'application/octet-stream' });
        path = 'web-download-' + crypto.randomUUID();
        downloads.set(path, { url: URL.createObjectURL(blob), name: current.name.split('/').at(-1) });
        current.parts = [];
        while (downloads.size > 100) {
          const oldest = downloads.keys().next().value;
          URL.revokeObjectURL(downloads.get(oldest).url);
          downloads.delete(oldest);
        }
      }
      window.DroplyWebNetwork.emit('saved', { tid, name: current.name, path });
      const entries = (await window.DroplyWebStore.history());
      await window.DroplyWebStore.set('history', [
        { id: crypto.randomUUID(), name: current.name, direction: 'in', state: 'done',
          date: new Date().toISOString(), peer: '', message: '' }, ...entries
      ].slice(0, 300));
      window.DroplyWebNetwork.emit('history-changed', await window.DroplyWebStore.history());
    }).catch(error => failed(rec, error.message || 'Could not finish incoming file'));
  }
  function saveAbort(tid) {
    const rec = transfers.get(tid);
    if (!rec) return;
    rec.cancelled = true;
    rec.queue.finally(async () => {
      try { await rec.current?.writer?.abort(); } catch {}
      if (rec.mode === 'disk') {
        try { await rec.parent.removeEntry(rec.directoryName, { recursive: true }); } catch {}
      }
    });
    transfers.delete(tid);
  }
  function finishReceive(tid) { transfers.delete(tid); }
  function showFile(path) {
    const entry = downloads.get(path);
    if (!entry) return;
    const a = document.createElement('a');
    a.href = entry.url;
    a.download = entry.name;
    document.body.append(a);
    a.click();
    a.remove();
  }
  window.DroplyWebReceive = { prepareReceive, saveOpen, saveChunk, saveClose, saveAbort,
    finishReceive, showFile, safeName };
})();
