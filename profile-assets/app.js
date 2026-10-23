/*
  index.html 主逻辑
  ------------------------------------------------------------
  想改的东西 → 改哪里
    · 标题 / 姓名 / 简介 / 标签 / 项目 / 个人能力 / 收信配置
        → content.js（焱暒妏）与 content.zh-hant.js（地球文繁体）
    · 界面提示语（[ READY ]、[ TYPING ]、菜单无障碍标签等）
        → index.html 末尾的「UI 文案表」（#ui-copy）
    · 命令列表和命令对应的输出
        → 本文件下方 COMMANDS 与 runCommand()
    · 外观样式
        → style.css
    · 启动检测那一段输出
        → boot.js
  改完保存后在浏览器里按 F5 刷新即可（本地直接双击打开也行）。
*/

(function initProfile() {
  'use strict';

  // ==========================================================
  // 1. 元素与基础状态
  // ==========================================================
  const $ = id => document.getElementById(id);
  const input = $('command');
  const menu = $('command-menu');
  const options = $('command-options');
  const output = $('terminal-output');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const UI = readUiCopy();
  function readUiCopy() {
    try {
      const defaults = {
        'script-mars': '焱暒妏',
        'script-earth': '地球文',
        'aria-script-mars': '当前焱暒妏，点击切换到地球文',
        'aria-script-earth': '当前地球文，点击切换到焱暒妏',
        'menu-toggle-open': '收起命令菜单',
        'menu-toggle-closed': '展开命令菜单',
        'status-typing': '[ TYPING ]',
        'status-booting': '[ BOOTING ]',
        'status-ready': '[ READY ]',
        'announce-boot-complete': '[ BOOT COMPLETE ]',
        'announce-clear': '[ CLEAR ]',
        'unknown-command': '[ UNKNOWN COMMAND ]\nHELP / [命令帮助]',
        'email-placeholder': '[邮箱地址]'
      };
      const holder = $('ui-copy');
      const raw = holder ? JSON.parse(holder.textContent) : {};
      const mars = Object.assign(defaults, raw.mars || raw);
      const earth = raw.earth || {};
      // This shared path always follows the Earth copy in both modes.
      mars['toolbar-path'] = earth['toolbar-path'] || mars['toolbar-path'];
      return new Proxy(mars, { get(base, key) {
        const translated = earth[key];
        return !language && typeof translated === 'string' && translated !== '' ? translated : base[key];
      }});
    } catch (error) {
      console.warn('UI 文案表解析失败，已使用默认文案：', error);
      return {};
    }
  }

  // ==========================================================
  // 2. 命令表：id 用于输入，label 用于菜单显示
  // ==========================================================
  const COMMANDS = [
    { id: 'solo', get label() { return UI['command-solo']; } },
    { id: 'collab', get label() { return UI['command-collab']; } },
    { id: 'skill', get label() { return UI['command-skill']; } },
    { id: 'email', get label() { return UI['command-email']; } },
    { id: 'help', get label() { return UI['command-help']; } },
    { id: 'boot', get label() { return UI['command-boot']; } },
    { id: 'clear', get label() { return UI['command-clear']; } }
  ];

  // ==========================================================
  // 3. 字符模式
  //    焱暒妏 = content.js 的内容（默认，写什么显示什么）
  //    地球文 = content.zh-hant.js 的文案；某项留空时自动沿用 content.js
  //    MARS_STYLE 打开后，焱暒妏模式还会把下面几个字换成火星字形
  //    （只影响显示，不改变 content.js 的内容；想「所见即所写」就保持 false）
  // ==========================================================
  const MARS_STYLE = false;
  const MARS_CHARS = { 人: '亾', 自: '洎', 我: '莪', 的: 'の', 火: '吙', 星: '煋' };

  const MARS_DATA = window.PROFILE_CONTENT || {};
  const EARTH_DATA = window.PROFILE_CONTENT_TRADITIONAL || {};

  let language = 1;          // 1 = 焱暒妏，0 = 地球文
  let activeIndex = -1;      // 命令菜单当前高亮项
  let filtered = [];         // 命令菜单过滤结果
  let frame = 0;             // 打字动画的 rAF 句柄
  let generation = 0;        // 每次中断打字时 +1，旧动画据此停止
  let current = null;        // 正在打字的条目

  try {
    language = Number(localStorage.getItem('profile-script') ?? 1);
  } catch (error) { /* 隐私模式下忽略 */ }
  if (![0, 1].includes(language)) language = 1;

  // 当前模式下的内容；地球文里留空的字段回落到焱暒妏内容
  function content() {
    function fallback(base, translated) {
      if (translated === undefined || translated === null || translated === '') return base;
      if (Array.isArray(base) && Array.isArray(translated)) {
        return Array.from({ length: Math.max(base.length, translated.length) }, (_, i) => fallback(base[i], translated[i]));
      }
      if (base && translated && typeof base === 'object' && typeof translated === 'object') {
        return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(translated)])]
          .map(key => [key, fallback(base[key], translated[key])]));
      }
      return translated;
    }
    return language ? MARS_DATA : fallback(MARS_DATA, EARTH_DATA);
  }

  // 内容文字输出；只有打开 MARS_STYLE 时才做火星字替换
  function text(value) {
    const raw = String(value ?? '');
    return MARS_STYLE && language
      ? Array.from(raw).map(char => MARS_CHARS[char] || char).join('')
      : raw;
  }


  // ==========================================================
  // 4. 身份卡
  // ==========================================================
  function renderIdentity() {
    document.documentElement.dataset.script = language ? 'mars' : 'earth';
    document.documentElement.lang = language ? 'zh-CN' : 'zh-Hant';
    const data = content();
    const fields = [
      ['profile-title', 'title'],
      ['profile-name', 'name'],
      ['profile-id', 'id'],
      ['profile-bio', 'bio']
    ];
    for (const [elementId, key] of fields) {
      const value = text(data[key] ?? '');
      // Fullwidth Latin has no Courier glyphs. Map only the account's Latin width.
      $(elementId).textContent = key === 'id'
        ? value.replace(/[！-～]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
        : value;
    }

    // 当前字符模式显示下划线，另一个不加
    document.querySelectorAll('[data-ui]').forEach(node => {
      const key = node.dataset.ui;
      if (typeof UI[key] === 'string') node.textContent = UI[key];
      if (key === 'script-mars' || key === 'script-earth') {
        node.classList.toggle('selected-script', (key === 'script-mars') === Boolean(language));
      }
    });
    for (const [selector, dataKey, attribute] of [['[data-ui-aria]', 'uiAria', 'aria-label'], ['[data-ui-placeholder]', 'uiPlaceholder', 'placeholder'], ['[data-ui-title]', 'uiTitle', 'title']]) {
      document.querySelectorAll(selector).forEach(node => node.setAttribute(attribute, UI[node.dataset[dataKey]] || ''));
    }
    $('status').textContent = UI['status-ready'];
    $('menu-toggle').setAttribute('aria-label', UI[menu.hidden ? 'menu-toggle-closed' : 'menu-toggle-open']);
    $('language').setAttribute('aria-label', language ? UI['aria-script-mars'] : UI['aria-script-earth']);

    try {
      localStorage.setItem('profile-script', language);
    } catch (error) { /* 忽略 */ }
  }

  // ==========================================================
  // 5. 命令菜单
  // ==========================================================
  function setMenu(open) {
    try {
      return open ? openMenu() : closeMenu();
    } catch (error) {
      console.error('[app.js] 命令菜单异常：', error);
      return undefined;
    }
  }

  function openMenu() {
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    $('menu-toggle').setAttribute('aria-expanded', 'true');
    $('menu-toggle').setAttribute('aria-label', UI['menu-toggle-open']);
    return renderMenu();
  }

  function closeMenu() {
    menu.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    $('menu-toggle').setAttribute('aria-expanded', 'false');
    $('menu-toggle').setAttribute('aria-label', UI['menu-toggle-closed']);
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function renderMenu() {
    const query = input.value.trim().toLowerCase();
    filtered = COMMANDS.filter(command =>
      command.id.includes(query) || command.label.includes(query) || text(command.label).includes(query)
    );
    activeIndex = -1;
    options.replaceChildren();
    $('menu-empty').hidden = filtered.length > 0;
    for (const command of filtered) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'command-option';
      option.id = 'option-' + command.id;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.tabIndex = -1;

      const label = document.createElement('span');
      const code = document.createElement('code');
      const slash = document.createElement('span');
      label.textContent = text(command.label);
      code.textContent = command.id.toUpperCase();
      slash.textContent = '/';
      slash.className = 'menu-separator';
      option.append(code, slash, label);

      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => execute(command.id));
      options.append(option);
    }
    input.removeAttribute('aria-activedescendant');
  }

  function moveSelection(step) {
    if (menu.hidden) setMenu(true);
    if (!filtered.length) return;
    activeIndex = activeIndex < 0
      ? (step < 0 ? filtered.length - 1 : 0)
      : (activeIndex + step + filtered.length) % filtered.length;
    Array.from(options.children).forEach((element, index) =>
      element.setAttribute('aria-selected', String(index === activeIndex))
    );
    const selected = options.children[activeIndex];
    input.setAttribute('aria-activedescendant', selected.id);
    selected.scrollIntoView({ block: 'nearest' });
  }

  // ==========================================================
  // 6. 中断、安全链接、输出构造
  // ==========================================================
  function cancelBoot() {
    const job = window.Profile.bootJob;
    if (!job) return;
    job.cancelled = true;
    job.controllers.forEach(controller => controller.abort());
    if (job.completeStep) job.completeStep();
    window.Profile.bootJob = null;
  }

  function cancelTyping() {
    cancelBoot();
    generation++;
    cancelAnimationFrame(frame);
    if (current) current.response.classList.remove('typing');
    current = null;
    $('skip').disabled = true;
    output.setAttribute('aria-busy', 'false');
  }

  function safeUrl(raw) {
    try {
      let value = String(raw || '').trim();
      if (!value) return null;
      value = value.replace(/^(https?)\/\//i, '$1://');
      if (value.startsWith('//')) value = 'https:' + value;
      else if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(value)) value = 'https://' + value;
      const url = new URL(value, location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch (error) {
      return null;
    }
  }

  // 只接受 https 的表单端点（Formspree 之类的服务）
  function safeEndpoint(raw) {
    try {
      const url = new URL(String(raw || '').trim());
      return url.origin === 'https://formspree.io' && /^\/f\/[a-zA-Z0-9]+$/.test(url.pathname)
        && !url.username && !url.password && !url.search && !url.hash ? url.href : null;
    } catch (error) {
      return null;
    }
  }

  // 把一条输出变成可逐字显示的节点：普通文本，或编号表格（PROJECT / HELP）
  function buildOutput(response, message, table) {
    const targets = [];
    function cell(parent, value, className = '') {
      const span = document.createElement('span');
      span.className = className;
      parent.append(span);
      targets.push({ node: span, chars: Array.from(text(value)) });
      return span;
    }
    if (table) {
      response.classList.add('output-table', table.kind + '-table');
      if (table.kind === 'skill') response.classList.add('project-table');
      for (const item of table.rows) {
        const row = document.createElement('div');
        row.className = 'output-row';
        response.append(row);
        cell(row, item.prefix, 'output-prefix');
        cell(row, '/', 'output-separator');
        cell(row, item.label, 'output-label');
        if (table.kind === 'project' || table.kind === 'skill') {
          const details = document.createElement('div');
          details.className = 'project-details';
          row.append(details);
          function detail(label, value, className) {
            cell(details, label, 'project-detail-key');
            cell(details, value, className);
          }
          for (const field of item.fields || []) {
            if (field.value && field.value.trim()) detail(field.label, field.value, 'output-description');
          }
          if (item.role && item.role.trim()) detail('ROLE', item.role, 'output-role');
          if (item.description && item.description.trim()) detail('ABOUT', item.description, 'output-description');
          if (!details.children.length) details.remove();
        } else if (item.description !== undefined) {
          cell(row, item.description, 'output-description');
        }
        if (item.href) {
          const anchor = document.createElement('a');
          anchor.className = 'output-link';
          anchor.href = item.href;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.setAttribute('aria-label', text(item.label) + ' / ' + item.href);
          anchor.hidden = true;
          row.append(anchor);
          targets.push({ node: anchor, chars: Array.from(item.href.replace(/^https?:\/\//i, '')) });
        }
      }
    } else {
      response.classList.add('plain-output');
      cell(response, message);
    }
    return targets;
  }

  // ==========================================================
  // 7. 打字动画
  // ==========================================================
  function reveal(job, count) {
    let remaining = count;
    for (const target of job.targets) {
      const length = Math.max(0, Math.min(remaining, target.chars.length));
      target.node.textContent = target.chars.slice(0, length).join('');
      if (target.node.classList.contains('output-link')) target.node.hidden = length === 0;
      target.node.classList.toggle(
        'typing-cell',
        Number.isFinite(count) && remaining > 0 && remaining <= target.chars.length
      );
      remaining -= target.chars.length;
    }
  }

  function finishTyping(job) {
    if (current !== job) return;
    reveal(job, Infinity);
    job.response.classList.remove('typing');
    if (job.links.length) {
      const list = document.createElement('div');
      list.className = 'entry-links';
      for (const link of job.links) {
        const anchor = document.createElement('a');
        anchor.textContent = text(link.label);
        anchor.href = link.href;
        if (!link.href.startsWith('mailto:')) {
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
        }
        list.append(anchor);
      }
      job.entry.append(list);
    }
    current = null;
    $('skip').disabled = true;
    output.setAttribute('aria-busy', 'false');
    $('status').textContent = UI['status-ready'];
    $('announcement').textContent = job.message;
    output.scrollTop = output.scrollHeight;
  }

  function write(command, message, links = [], table = null) {
    if (current) {
      cancelAnimationFrame(frame);
      finishTyping(current);
    }
    cancelTyping();

    const entry = document.createElement('section');
    entry.className = 'entry';
    entry.dataset.command = command;

    const echo = document.createElement('p');
    echo.className = 'echo';
    echo.textContent = UI['echo-prefix'] + command.toUpperCase();

    const response = document.createElement('div');
    response.className = 'response';
    entry.append(echo, response);
    output.append(entry);
    while (output.children.length > 12) output.firstElementChild.remove();

    const targets = buildOutput(response, message, table);
    startTyping({ entry, response, message: text(message), links, targets });
  }

  function startTyping(job) {
    const { response, targets } = job;
    current = job;
    const token = generation;
    if (reduced.matches) {
      finishTyping(job);
      return;
    }

    response.classList.add('typing');
    $('skip').disabled = false;
    $('status').textContent = UI['status-typing'];
    output.setAttribute('aria-busy', 'true');

    const total = targets.reduce((sum, target) => sum + target.chars.length, 0);
    let shown = 0;
    let last = 0;
    function tick(now) {
      if (token !== generation) return;
      if (now - last >= 32) {
        reveal(job, ++shown);
        last = now;
        output.scrollTop = output.scrollHeight;
      }
      if (shown >= total) finishTyping(job);
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }

  // ==========================================================
  // 8. 执行命令
  // ==========================================================
  function execute(raw) {
    const command = String(raw || '').trim().toLowerCase();
    if (command !== 'email') contact.suspend();
    input.value = '';
    setMenu(false);
    try {
      runCommand(command);
    } catch (error) {
      // 内容格式写错时不要把整页卡死，直接把原因显示在终端里，方便自己修 content.js
      console.error('[app.js] 命令 "' + command + '" 执行出错：', error);
      cancelTyping();
      write(command || 'error', UI['command-error'] + (error && error.message ? error.message : String(error)), [], null);
    }
  }

  function runCommand(command) {
    const data = content();
    if (command === 'boot') {
      window.startBoot();
      return;
    }
    if (command === 'clear') {
      cancelTyping();
      output.replaceChildren();
      $('status').textContent = UI['status-ready'];
      $('announcement').textContent = UI['announce-clear'];
      return;
    }
    if (command === 'solo' || command === 'collab' || command === 'project') {
      if (command === 'project') command = 'solo';
      const items = (command === 'collab' ? data.collabs : data.projects) || [];
      if (!items.length) { write(command, UI['project-empty']); return; }
      const rows = items.map((item, index) => ({
        prefix: String(index + 1).padStart(2, '0'),
        label: item.name,
        description: item.description,
        role: item.role,
        href: safeUrl(item.url)
      }));
      write(
        command,
        rows.map(row => row.prefix + ' / ' + row.label + '\n' + row.description).join('\n\n'),
        [],
        { kind: 'project', rows }
      );
      return;
    }
    if (command === 'skill') {
      if (data.skillGroups?.length) {
        const rows = data.skillGroups.map((group, index) => ({
          prefix: String(index + 1).padStart(2, '0'), label: group.name, fields: group.fields || []
        }));
        write(command, rows.map(row => row.label + '\n' + row.fields.map(field => field.label + ' / ' + field.value).join('\n')).join('\n\n'), [], { kind: 'skill', rows });
      } else write(command, (data.skills || []).join('\n'));
      return;
    }
    if (command === 'email') {
      contact.show();
      return;
    }
    if (command === 'help' || !command) {
      write(
        'help',
        COMMANDS.map(item => item.id + ' / ' + item.label).join('\n'),
        [],
        { kind: 'help', rows: COMMANDS.map(item => ({ prefix: item.id.toUpperCase(), label: item.label })) }
      );
      return;
    }
    write(command, UI['unknown-command']);
  }

  // ==========================================================
  // 9. 事件绑定
  // ==========================================================
  function finishActivePrompt() {
    if (current) {
      cancelAnimationFrame(frame);
      finishTyping(current);
    }
  }
  const contact = window.createProfileContact({
    UI, input, messageInput: $('contact-message-input'), form: $('command-form'), output,
    menuToggle: $('menu-toggle'), endpoint: () => safeEndpoint(MARS_DATA.contactEndpoint),
    closeMenu: () => setMenu(false), cancelOutput: cancelTyping, finishPrompt: finishActivePrompt,
    typePrompt(entry, response, targets, message) {
      finishActivePrompt();
      cancelTyping();
      startTyping({ entry, response, targets, message, links: [] });
    }
  });

  function submitInput() {
    if (contact.active()) contact.answer();
    else execute(!menu.hidden && activeIndex >= 0 ? filtered[activeIndex].id : input.value);
  }

  input.addEventListener('click', () => { if (!contact.active()) setMenu(true); });
  input.addEventListener('input', () => {
    if (contact.active()) contact.capture();
    else setMenu(true);
  });
  $('contact-message-input').addEventListener('input', () => contact.capture());

  function contactKey(event) {
    if (!contact.active()) return false;
    if (event.key === 'Escape') { event.preventDefault(); contact.cancel(); }
    else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) submitInput();
    }
    return true;
  }
  $('contact-message-input').addEventListener('keydown', event => {
    if (!event.isComposing) contactKey(event);
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing || contactKey(event)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setMenu(false);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      execute(!menu.hidden && activeIndex >= 0 ? filtered[activeIndex].id : input.value);
    }
  });

  $('menu-toggle').addEventListener('click', () => {
    if (contact.active()) return;
    const open = menu.hidden;
    input.focus();
    setMenu(open);
  });

  $('command-form').addEventListener('submit', event => {
    event.preventDefault();
    submitInput();
  });

  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.reply')) setMenu(false);
  });
  document.addEventListener('focusin', event => {
    if (!event.target.closest('.reply')) setMenu(false);
  });

  $('skip').addEventListener('click', () => {
    if (!current) return;
    cancelAnimationFrame(frame);
    finishTyping(current);
  });

  reduced.addEventListener('change', () => {
    const boot = window.Profile.bootJob;
    if (reduced.matches && boot) {
      boot.fast = true;
      if (boot.completeStep) boot.completeStep();
    }
    if (reduced.matches && current) {
      cancelAnimationFrame(frame);
      finishTyping(current);
    }
  });

  $('language').addEventListener('click', () => {
    const previous = output.lastElementChild?.dataset.command || 'help';
    if (contact.active()) contact.capture();
    language = language ? 0 : 1;
    renderIdentity();
    cancelTyping();
    output.replaceChildren();
    if (previous !== 'email' || !contact.restore()) execute(previous);
  });

  // 供 boot.js 与调试/自动化使用：共享元素、取消打字、启动检测句柄
  window.Profile = {
    UI,
    run: execute,
    setMenu,
    text,
    $,
    output,
    reduced,
    cancelTyping,
    bootJob: null,
    startBoot() {
      return typeof window.startBoot === 'function' ? window.startBoot() : undefined;
    }
  };

  // ==========================================================
  // 10. 启动
  // ==========================================================
  renderIdentity();
  window.Profile.startBoot();
})();
