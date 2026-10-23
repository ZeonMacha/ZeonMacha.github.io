/* 与我联系：复用终端底部输入行，逐句收集内容，两次确认后才发送。 */
window.createProfileContact = function createProfileContact(host) {
  'use strict';
  const { UI, input, messageInput, form, output, menuToggle, endpoint, typePrompt, finishPrompt, cancelOutput } = host;
  const fields = [
    { name: 'name', prompt: 'contact-name', label: 'contact-label-name', max: 80, autocomplete: 'nickname' },
    { name: 'email', prompt: 'contact-mail', label: 'contact-label-mail', max: 120, autocomplete: 'email' },
    { name: 'subject', prompt: 'contact-subject', label: 'contact-label-subject', max: 120, optional: true },
    { name: 'message', prompt: 'contact-message', label: 'contact-label-message', max: 2000 }
  ];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const submitButton = form.querySelector('[type="submit"]');
  const trap = document.getElementById('contact-trap');
  let session = null;
  let visible = false;
  let entry = null;

  function active() {
    return visible && session && !['sent', 'paused'].includes(session.phase);
  }

  function bilingual(key, className = 'contact-question') {
    const block = document.createElement('div');
    block.className = className;
    const cn = document.createElement('p');
    cn.className = 'contact-cn';
    cn.lang = document.documentElement.lang;
    cn.textContent = UI[key] || '';
    const en = document.createElement('p');
    en.className = 'contact-en';
    en.lang = 'en';
    en.textContent = UI[key + '-en'] || '';
    block.append(cn, en);
    return block;
  }

  function renderRecord(record, index, animate = false) {
    let node;
    if (record.kind === 'answer') {
      node = document.createElement('div');
      node.className = 'contact-answer';
      const prompt = document.createElement('span');
      prompt.className = 'contact-answer-prefix';
      prompt.textContent = UI['answer-prefix'];
      const value = document.createElement('div');
      if (record.value) value.textContent = record.value;
      else value.append(bilingual('contact-empty'));
      node.append(prompt, value);
    } else if (record.kind === 'review') {
      node = bilingual('contact-review', 'contact-review');
      const dl = document.createElement('dl');
      for (const field of fields) {
        const dt = document.createElement('dt');
        dt.append(bilingual(field.label));
        const dd = document.createElement('dd');
        if (record.values[field.name]) dd.textContent = record.values[field.name];
        else dd.append(bilingual('contact-empty'));
        dl.append(dt, dd);
      }
      node.append(dl);
    } else {
      node = bilingual(record.key);
      if (record.tone) node.classList.add('contact-' + record.tone);
    }
    node.dataset.contactRecord = index;
    node.id = 'contact-record-' + index;
    const chinese = node.querySelector('.contact-cn');
    const english = node.querySelector('.contact-en');
    if (chinese) chinese.id = node.id + '-cn';
    if (english) english.id = node.id + '-en';
    entry.append(node);
    if (animate && record.kind === 'prompt' && visible) {
      const targets = [...node.querySelectorAll('p')].map(p => {
        const chars = Array.from(p.textContent);
        p.textContent = '';
        return { node: p, chars };
      });
      typePrompt(entry, node, targets, (UI[record.key] || '') + '\n' + (UI[record.key + '-en'] || ''));
    }
    return node;
  }

  function append(record, animate = false) {
    session.history.push(record);
    if (entry?.isConnected) renderRecord(record, session.history.length - 1, animate);
    if (visible) output.scrollTop = output.scrollHeight;
    if (visible && !animate && record.kind === 'prompt') {
      document.getElementById('announcement').textContent = (UI[record.key] || '') + '\n' + (UI[record.key + '-en'] || '');
    }
  }

  function prompt(key, tone) {
    append({ kind: 'prompt', key, tone }, true);
  }

  function render() {
    output.querySelectorAll('.entry[data-command="email"]').forEach(node => node.remove());
    entry = document.createElement('section');
    entry.className = 'entry contact-dialogue';
    entry.dataset.command = 'email';
    const echo = document.createElement('p');
    echo.className = 'echo';
    echo.textContent = UI['echo-prefix'] + 'EMAIL';
    entry.append(echo);
    output.append(entry);
    while (output.children.length > 12) output.firstElementChild.remove();
    session.history.forEach((record, index) => renderRecord(record, index));
    output.scrollTop = output.scrollHeight;
  }

  function syncInput(focus = false) {
    const live = active();
    const field = session?.phase === 'fields' ? fields[session.index] : null;
    const multiline = live && field?.name === 'message';
    const pending = live && session.phase === 'sending';
    form.classList.toggle('contact-mode', Boolean(live));
    form.noValidate = Boolean(live);
    messageInput.hidden = !multiline;
    input.hidden = Boolean(multiline);
    menuToggle.disabled = Boolean(live);
    submitButton.disabled = Boolean(pending);
    input.disabled = messageInput.disabled = Boolean(pending);
    input.type = live && field?.name === 'email' ? 'email' : 'text';
    if (live) {
      const control = multiline ? messageInput : input;
      control.maxLength = field?.max || 20;
      control.autocomplete = field?.autocomplete || 'off';
      control.value = session.reply;
      control.placeholder = UI[field ? 'input-' + field.name : pending ? 'input-sending' : 'input-choice'];
      const latest = [...entry.children].reverse().find(node => node.classList.contains('contact-question') || node.classList.contains('contact-review'));
      control.setAttribute('aria-labelledby', (latest?.id || 'contact-record-0') + '-cn');
      control.setAttribute('aria-describedby', (latest?.id || 'contact-record-0') + '-en');
      const labelKey = field ? field.prompt : 'contact-choice-label';
      control.setAttribute('aria-label', UI[labelKey] + ' / ' + UI[labelKey + '-en']);
      input.setAttribute('role', 'textbox');
      ['aria-controls', 'aria-autocomplete', 'aria-expanded', 'aria-activedescendant'].forEach(key => input.removeAttribute(key));
      submitButton.setAttribute('aria-label', UI['contact-next'] + ' / ' + UI['contact-next-en']);
      if (focus && !pending) control.focus({ preventScroll: true });
      if (focus && session.phase === 'review') {
        const reviewNode = entry.querySelector('.contact-review:last-child');
        if (reviewNode) output.scrollTop += reviewNode.getBoundingClientRect().top - output.getBoundingClientRect().top - 4;
      }
    } else {
      input.value = '';
      input.removeAttribute('maxlength');
      input.autocomplete = 'off';
      input.placeholder = UI['command-placeholder'];
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-label', UI['aria-command']);
      input.setAttribute('aria-controls', 'command-options');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-labelledby');
      input.removeAttribute('aria-describedby');
      input.removeAttribute('aria-invalid');
      messageInput.removeAttribute('aria-invalid');
      submitButton.setAttribute('aria-label', UI['aria-submit']);
    }
  }

  function askField(reply = session.draft[fields[session.index].name]) {
    session.phase = 'fields';
    session.reply = reply;
    prompt(fields[session.index].prompt);
    syncInput(true);
  }

  function review() {
    session.phase = 'review';
    session.reply = '';
    append({ kind: 'review', values: { ...session.draft } });
    syncInput(true);
  }

  function show() {
    finishPrompt();
    cancelOutput();
    host.closeMenu();
    if (!session || session.phase === 'sent') {
      session = { phase: 'fields', index: 0, reply: '', draft: { name: '', email: '', subject: '', message: '' }, history: [] };
    }
    visible = true;
    render();
    if (!session.history.length) {
      if (!endpoint()) append({ kind: 'prompt', key: 'contact-offline', tone: 'muted' });
      askField();
    } else if (session.phase === 'paused') {
      if (session.resumeIndex !== null) { session.index = session.resumeIndex; askField(session.resumeReply); }
      else review();
    } else {
      syncInput(true);
    }
  }

  function capture() {
    if (!active() || session.phase === 'sending') return;
    const control = session.phase === 'fields' && fields[session.index].name === 'message' ? messageInput : input;
    session.reply = control.value;
    control.removeAttribute('aria-invalid');
  }

  function pause(key = 'contact-cancelled') {
    finishPrompt();
    append({ kind: 'prompt', key });
    session.resumeIndex = session.phase === 'fields' ? session.index : null;
    session.resumeReply = session.reply;
    session.phase = 'paused';
    session.reply = '';
    syncInput();
    input.focus({ preventScroll: true });
  }

  function cancel() {
    if (active() && session.phase !== 'sending') pause();
  }

  function suspend() {
    if (active()) capture();
    visible = false;
    syncInput();
  }

  function restore() {
    if (!session) return false;
    visible = true;
    render();
    syncInput(active());
    return true;
  }

  function openVerification() {
    const url = endpoint();
    if (!url) return pause('contact-offline');
    if (trap.value) return pause('contact-failed');
    const hosted = document.createElement('form');
    hosted.action = url;
    hosted.method = 'POST';
    hosted.target = '_blank';
    hosted.rel = 'noopener noreferrer';
    for (const [name, value] of Object.entries({ ...session.draft, _gotcha: '' })) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden'; hidden.name = name; hidden.value = value;
      hosted.append(hidden);
    }
    document.body.append(hosted);
    hosted.submit();
    hosted.remove();
    pause('contact-verify-opened');
  }

  async function send() {
    const url = endpoint();
    if (!url) return pause('contact-offline');
    if (trap.value) return pause('contact-failed');
    session.phase = 'sending';
    session.reply = '';
    append({ kind: 'prompt', key: 'contact-sending' });
    syncInput();
    const data = new FormData();
    for (const field of fields) data.set(field.name, session.draft[field.name]);
    data.set('_gotcha', '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { Accept: 'application/json' }, body: data,
        credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        const error = new Error('Submission not accepted');
        error.verification = /captcha/i.test(JSON.stringify(result.errors || result.error || ''));
        throw error;
      }
      append({ kind: 'prompt', key: 'contact-sent', tone: 'ok' });
      session.phase = 'sent';
      fields.forEach(field => { session.draft[field.name] = ''; });
    } catch (error) {
      session.phase = error.verification ? 'verify' : 'retry';
      append({ kind: 'prompt', key: error.verification ? 'contact-verify-required' : error.name === 'AbortError' ? 'contact-timeout' : 'contact-failed', tone: 'error' });
    } finally {
      clearTimeout(timeout);
      if (visible) syncInput(active());
    }
  }

  function answer() {
    if (!active() || session.phase === 'sending') return;
    capture();
    finishPrompt();
    const value = session.reply.trim();
    const choice = value.toUpperCase();
    if (choice === '/CANCEL') {
      if (session.phase === 'fields') session.reply = session.draft[fields[session.index].name];
      return pause();
    }
    if (choice === '/BACK') {
      session.index = session.phase === 'fields' ? Math.max(0, session.index - 1) : fields.length - 1;
      return askField();
    }
    if (session.phase === 'fields') {
      const field = fields[session.index];
      const invalid = !field.optional && !value || value.length > field.max;
      if (invalid || field.name === 'email' && !emailPattern.test(value)) {
        prompt(value.length > field.max ? 'contact-too-long' : field.name === 'email' ? 'contact-badmail' : 'contact-required', 'error');
        syncInput(true);
        (field.name === 'message' ? messageInput : input).setAttribute('aria-invalid', 'true');
        return;
      }
      session.draft[field.name] = value;
      append({ kind: 'answer', value });
      if (++session.index < fields.length) askField();
      else review();
      return;
    }
    if (!['YES', 'NO'].includes(choice)) {
      prompt('contact-choice', 'error');
      session.reply = '';
      syncInput(true);
      return;
    }
    append({ kind: 'answer', value: choice });
    session.reply = '';
    if (session.phase === 'review') {
      if (choice === 'NO') { session.index = 0; return askField(); }
      session.phase = 'confirm';
      prompt('contact-confirm');
      syncInput(true);
    } else if (choice === 'NO') {
      pause();
    } else if (session.phase === 'verify') {
      openVerification();
    } else {
      void send();
    }
  }

  return { active, show, capture, answer, cancel, suspend, restore };
};
