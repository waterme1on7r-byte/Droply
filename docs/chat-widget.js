(() => {
  'use strict';
  const endpoint = 'https://zyppzqwqacvdnfiajbpp.supabase.co/functions/v1/droply-chat';
  const root = document.createElement('div');
  root.className = 'droply-chat';
  root.innerHTML = "<button class=\"droply-chat-launch\" type=\"button\" aria-expanded=\"false\" aria-controls=\"droply-chat-panel\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M20 11.5a8 8 0 0 1-8 8c-1.4 0-2.7-.3-3.9-1L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z\"/><path d=\"M8 11.5h8\"/></svg>Get help</button>\n<section id=\"droply-chat-panel\" class=\"droply-chat-panel\" role=\"region\" aria-label=\"Droply help and support\" hidden>\n <div class=\"droply-chat-header\"><div><strong>Droply support</strong><span>AI assistant · Human ticket handoff</span></div><button type=\"button\" class=\"droply-chat-close\" aria-label=\"Close help\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6 6 18 18M18 6 6 18\"/></svg></button></div>\n <div class=\"droply-chat-conversation\">\n  <p class=\"droply-chat-notice\">AI messages are sent to an AI provider for a response. Please don't share private keys, passwords or sensitive information. <a href=\"support-privacy.html\">Support privacy</a>.</p>\n  <div class=\"droply-chat-messages\" role=\"log\" aria-live=\"polite\" aria-relevant=\"additions text\" aria-label=\"Support conversation\"></div>\n  <p class=\"droply-chat-status\" role=\"status\" aria-live=\"polite\"></p>\n  <form class=\"droply-chat-form\"><label class=\"droply-chat-label\" for=\"droply-chat-input\">Your support message</label><textarea id=\"droply-chat-input\" rows=\"2\" maxlength=\"2000\" placeholder=\"How can we help?\" required></textarea><button class=\"droply-chat-send\" type=\"submit\">Send</button></form>\n  <div class=\"droply-chat-footer\"><button class=\"droply-chat-ticket\" type=\"button\">Create support ticket</button><button class=\"droply-chat-clear\" type=\"button\">Clear chat</button></div>\n </div>\n <div class=\"droply-chat-ticket-view\" hidden>\n  <button class=\"droply-chat-back\" type=\"button\">Back to chat</button>\n  <div class=\"droply-chat-ticket-form-view\">\n   <h3>Create a support ticket.</h3><p>Your reviewed issue summary goes into the private Support ticket requests inbox, separate from ordinary contact messages.</p>\n   <form class=\"droply-chat-ticket-form\">\n    <div class=\"droply-chat-ticket-field\"><label for=\"droply-ticket-name\">Your name</label><input id=\"droply-ticket-name\" name=\"name\" maxlength=\"80\" autocomplete=\"name\" placeholder=\"Your name\" required></div>\n    <div class=\"droply-chat-ticket-field\"><label for=\"droply-ticket-email\">Email address</label><input id=\"droply-ticket-email\" name=\"email\" type=\"email\" inputmode=\"email\" maxlength=\"254\" autocomplete=\"email\" placeholder=\"you@example.com\" required></div>\n    <div class=\"droply-chat-ticket-field\"><label for=\"droply-ticket-summary\">Issue summary</label><textarea id=\"droply-ticket-summary\" name=\"summary\" rows=\"6\" minlength=\"10\" maxlength=\"4000\" placeholder=\"What happened, and what have you tried?\" required></textarea></div>\n    <div class=\"droply-chat-hp\" aria-hidden=\"true\"><label for=\"droply-ticket-website\">Leave blank</label><input id=\"droply-ticket-website\" name=\"website\" tabindex=\"-1\" autocomplete=\"off\"></div>\n    <p class=\"droply-chat-ticket-privacy\">Review your summary before submitting. It will be saved for the Droply support team. Don't include passwords, private keys or sensitive information. <a href=\"support-privacy.html\">Privacy details</a>.</p>\n    <button class=\"droply-chat-submit\" type=\"submit\">Submit ticket</button><p class=\"droply-chat-ticket-result\" role=\"status\" aria-live=\"polite\"></p>\n   </form>\n  </div>\n  <div class=\"droply-chat-ticket-confirm\" hidden role=\"status\"><strong>Support ticket created.</strong><p class=\"droply-chat-ticket-reference\"></p><p>Our team can review your request in the private support inbox. Keep this reference for your records.</p><button class=\"droply-chat-submit droply-chat-another\" type=\"button\">New ticket</button></div>\n </div>\n</section>";
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  const launch = $('.droply-chat-launch'), panel = $('.droply-chat-panel');
  const input = $('#droply-chat-input'), form = $('.droply-chat-form');
  const send = $('.droply-chat-send'), clear = $('.droply-chat-clear');
  const log = $('.droply-chat-messages'), status = $('.droply-chat-status');
  const conversation = $('.droply-chat-conversation'), ticketView = $('.droply-chat-ticket-view');
  const ticketForm = $('.droply-chat-ticket-form'), ticketButton = $('.droply-chat-submit');
  const ticketStatus = $('.droply-chat-ticket-result'), summary = $('#droply-ticket-summary');
  let history = [], chatPending = false, ticketPending = false;
  function addMessage(text, who) {
    const el = document.createElement('p');
    el.className = 'droply-chat-bubble ' + who;
    el.textContent = text;
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  addMessage("Hi, I'm the Droply support assistant. How can I help? You can also create a ticket for our team.", 'assistant');
  function openPanel(open) {
    panel.hidden = !open;
    launch.setAttribute('aria-expanded', String(open));
    if (open) (ticketView.hidden ? input : $('.droply-chat-back')).focus();
    else launch.focus();
  }
  function setTicketView(show) {
    conversation.hidden = show;
    ticketView.hidden = !show;
    ticketStatus.textContent = '';
    if (show) {
      $('.droply-chat-ticket-form-view').hidden = false;
      $('.droply-chat-ticket-confirm').hidden = true;
      if (!summary.value.trim() && history.length) {
        // Prefill only the visitor's own messages; they can review/edit them.
        summary.value = history.filter(m => m.role === 'user').slice(-4).map(m => m.content).join('\n\n').slice(0, 4000);
      }
      $('#droply-ticket-name').focus();
    } else input.focus();
  }
  launch.addEventListener('click', () => openPanel(panel.hidden));
  $('.droply-chat-close').addEventListener('click', () => openPanel(false));
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) openPanel(false);
  });
  $('.droply-chat-ticket').addEventListener('click', () => setTicketView(true));
  $('.droply-chat-back').addEventListener('click', () => setTicketView(false));
  clear.addEventListener('click', () => {
    if (chatPending) return;
    history = [];
    log.replaceChildren();
    addMessage("Hi, I'm the Droply support assistant. How can I help?", 'assistant');
    input.value = '';
    summary.value = '';
    status.textContent = '';
    input.focus();
  });
  async function request(action, payload, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(endpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }), signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The support service is unavailable.');
      return data;
    } finally { clearTimeout(timer); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || chatPending) return;
    chatPending = true; send.disabled = true; clear.disabled = true;
    status.classList.remove('error'); status.textContent = 'Thinking…';
    const bubble = addMessage(text, 'user');
    input.value = '';
    const next = [...history, { role: 'user', content: text }].slice(-11);
    try {
      const result = await request('chat', { messages: next }, 30000);
      if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('Chat unavailable');
      addMessage(result.reply, 'assistant');
      history = [...next, { role: 'assistant', content: result.reply.slice(0, 2000) }].slice(-10);
      status.textContent = '';
    } catch {
      history = [...history, { role: 'user', content: text }].slice(-10);
      bubble.remove();
      input.value = text;
      status.classList.add('error');
      status.textContent = 'AI chat is unavailable right now. You can still create a support ticket.';
    } finally { chatPending = false; send.disabled = false; clear.disabled = false; }
  });
  ticketForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (ticketPending || !ticketForm.reportValidity()) return;
    if (summary.value.trim().length < 10) {
      ticketStatus.textContent = 'Please describe your issue in at least 10 characters.';
      return;
    }
    ticketPending = true; ticketButton.disabled = true;
    ticketStatus.classList.remove('error');
    ticketStatus.textContent = 'Submitting your ticket…';
    try {
      const result = await request('ticket', {
        name: $('#droply-ticket-name').value.trim(),
        email: $('#droply-ticket-email').value.trim(),
        summary: summary.value.trim(),
        website: $('#droply-ticket-website').value
      }, 16000);
      if (!result.ok) throw new Error('Unable to create the ticket.');
      $('.droply-chat-ticket-reference').textContent = result.reference
        ? 'Ticket reference: ' + result.reference : 'Your request has been received.';
      $('.droply-chat-ticket-form-view').hidden = true;
      $('.droply-chat-ticket-confirm').hidden = false;
      ticketStatus.textContent = '';
      ticketForm.reset();
      $('.droply-chat-another').focus();
    } catch (err) {
      ticketStatus.classList.add('error');
      ticketStatus.textContent = err && err.name === 'AbortError'
        ? 'The request timed out. Please try again.'
        : err.message || 'Unable to send the ticket. Please try again.';
    } finally { ticketPending = false; ticketButton.disabled = false; }
  });
  $('.droply-chat-another').addEventListener('click', () => {
    $('.droply-chat-ticket-form-view').hidden = false;
    $('.droply-chat-ticket-confirm').hidden = true;
    summary.value = '';
    $('#droply-ticket-name').focus();
  });
})();
