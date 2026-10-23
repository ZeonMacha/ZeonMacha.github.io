/*
  启动检测（BOOT）：读取本机环境 → 探测站点连通性 → 界面映射进度 → 进入待命。
  ------------------------------------------------------------
  其中「本机环境」只用浏览器本来就有的信息（UA、时区、语言、在线状态），
  不做任何指纹采集；探测请求不带凭据、不保存结果。
  改检测项 / 文案：
    · 要探测的地址      → BOOT.PROBES
    · 逐字速度 / 超时   → BOOT.TYPE_INTERVAL / BOOT.PROBE_TIMEOUT
    · 本机环境条目      → startBoot() 里的 info 列表
    · 各阶段提示语      → startBoot() 里的 phrase(...)
  本文件依赖 app.js 暴露的 window.Profile（输出区、状态栏、取消打字）。
*/

(() => {
  'use strict';

  const BOOT = {
    // 探测目标（no-cors 只能确认「可达」，不暴露 HTTP 状态）
    PROBES: ['https://zeonmacha.github.io/', 'https://zeonmacha.github.io/index.html'],
    // 探测超时（毫秒）
    PROBE_TIMEOUT: 2200,
    // 逐字动画速度：每个字符间隔（毫秒）
    TYPE_INTERVAL: 9
  };

  // 用 UA / 平台信息推断系统名称
  function detectedSystem() {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1)) {
      return /iPhone/.test(ua) ? 'iOS' : 'iPadOS';
    }
    if (navigator.userAgentData?.platform) return navigator.userAgentData.platform;
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac/.test(ua)) return 'macOS';
    if (/CrOS/.test(ua)) return 'Chrome OS';
    if (/Linux/.test(ua)) return 'Linux';
    return window.Profile.UI['boot-unknown'];
  }

  // 逐字把文字写进某个节点
  function bootCell(job, node, value) {
    const chars = Array.from(value);
    if (job.fast) {
      node.textContent = value;
      return Promise.resolve();
    }
    return new Promise(resolve => {
      let start;
      const finish = () => {
        node.textContent = value;
        node.classList.remove('typing-cell');
        job.completeStep = null;
        resolve();
      };
      job.completeStep = finish;
      node.classList.add('typing-cell');
      function tick(now) {
        if (job.cancelled || job.fast) {
          finish();
          return;
        }
        start ??= now;
        const count = Math.min(chars.length, Math.floor((now - start) / BOOT.TYPE_INTERVAL) + 1);
        node.textContent = chars.slice(0, count).join('');
        job.output.scrollTop = job.output.scrollHeight;
        if (count === chars.length) finish();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  // 连通性探测：不跟随凭据、不缓存，opaque 响应只代表「可达」
  async function checkBootLink(job, url, node) {
    const controller = new AbortController();
    job.controllers.push(controller);
    const timeout = setTimeout(() => controller.abort(), BOOT.PROBE_TIMEOUT);
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        signal: controller.signal
      });
      if (job.cancelled) return;
      node.textContent = response.type === 'opaque'
        ? job.UI['boot-reachable']
        : response.ok ? job.UI['boot-http-ok'].replace('{status}', response.status) : job.UI['boot-http'].replace('{status}', response.status);
    } catch (error) {
      if (job.cancelled) return;
      node.textContent = navigator.onLine === false
        ? job.UI['boot-offline']
        : error.name === 'AbortError' ? job.UI['boot-timeout'] : job.UI['boot-unavailable'];
    } finally {
      clearTimeout(timeout);
    }
  }

  async function startBoot() {
    const P = window.Profile;
    if (!P) {
      console.error('[boot.js] 未找到 window.Profile，请确认 app.js 先于 boot.js 加载。');
      return;
    }
    const { output, $, reduced, UI } = P;
    P.cancelTyping();

    const job = { cancelled: false, fast: reduced.matches, controllers: [], completeStep: null, output, UI };
    P.bootJob = job;
    const active = () => P.bootJob === job && !job.cancelled;

    // ---- 输出容器 ----
    const entry = document.createElement('section');
    entry.className = 'entry boot-entry';
    entry.dataset.command = 'boot';

    const echo = document.createElement('p');
    echo.className = 'echo';
    echo.textContent = UI['echo-prefix'] + 'BOOT';

    const log = document.createElement('div');
    log.className = 'boot-log';
    entry.append(echo, log);
    output.append(entry);
    while (output.children.length > 12) output.firstElementChild.remove();

    $('skip').disabled = job.fast;
    $('status').textContent = UI['status-booting'];
    output.setAttribute('aria-busy', 'true');

    // 一行「键 / 值」
    function row(key) {
      const line = document.createElement('div');
      line.className = 'boot-row';
      const label = document.createElement('span');
      const slash = document.createElement('span');
      const value = document.createElement('span');
      label.className = 'boot-key';
      label.textContent = key;
      slash.textContent = '/';
      value.className = 'boot-value';
      line.append(label, slash, value);
      log.append(line);
      output.scrollTop = output.scrollHeight;
      return value;
    }

    // 一段整行文字（可多行）
    async function phrase(value, className = '') {
      const line = document.createElement('div');
      line.className = 'boot-value boot-phase ' + className;
      log.append(line);
      await bootCell(job, line, value);
    }

    try {
      // ---- 阶段 1：内核自检 ----
      await phrase(UI['boot-start'], 'boot-heading');
      if (!active()) return;
      await phrase(UI['boot-engine']);
      if (!active()) return;

      // ---- 阶段 2：本机环境 ----
      const now = new Date();
      const offset = -now.getTimezoneOffset();
      const utc = 'UTC' + (offset >= 0 ? '+' : '-') +
        String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0') + ':' +
        String(Math.abs(offset) % 60).padStart(2, '0');
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || utc;
      const localTime =
        [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-') +
        ' ' +
        [now.getHours(), now.getMinutes(), now.getSeconds()].map(value => String(value).padStart(2, '0')).join(':');

      const info = [
        [UI['boot-system'], detectedSystem().toUpperCase()],
        [UI['boot-timezone'], zone.toUpperCase() + ' / ' + utc],
        [UI['boot-time'], localTime],
        [UI['boot-language'], (navigator.languages?.length ? navigator.languages : [navigator.language || UI['boot-unknown']]).join(' / ').toUpperCase()],
        [UI['boot-network'], navigator.onLine === false ? job.UI['boot-offline'] : UI['boot-online']]
      ];
      for (const [key, value] of info) {
        if (!active()) return;
        await bootCell(job, row(key), value);
      }
      if (!active()) return;

      // ---- 阶段 3：站点连通性 ----
      await phrase(UI['boot-target'], 'boot-heading');
      if (!active()) return;

      const probes = [];
      for (const url of BOOT.PROBES) {
        const value = row(UI['boot-connect']);
        const address = document.createElement('span');
        const result = document.createElement('span');
        address.className = 'boot-address';
        result.className = 'boot-result';
        result.textContent = UI['boot-connecting'];
        value.append(address, result);
        await bootCell(job, address, url);
        if (!active()) return;
        probes.push(checkBootLink(job, url, result));
      }

      // ---- 阶段 4：界面映射进度条（0 → 100） ----
      const progress = document.createElement('div');
      progress.className = 'boot-progress';
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-label', UI['boot-progress-aria']);
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', '100');
      log.append(progress);

      function percent(value) {
        const count = Math.round(value / 5);
        progress.textContent =
          UI['boot-mapping'] + '\n[' + '#'.repeat(count) + '.'.repeat(20 - count) + '] ' + String(value).padStart(3, ' ') + '%';
        progress.setAttribute('aria-valuenow', String(value));
        output.scrollTop = output.scrollHeight;
      }
      percent(0);
      await Promise.allSettled(probes);
      if (!active()) return;

      if (!job.fast) {
        await new Promise(resolve => {
          let start;
          const finish = () => {
            percent(100);
            job.completeStep = null;
            resolve();
          };
          job.completeStep = finish;
          function tick(timestamp) {
            if (job.cancelled || job.fast) {
              finish();
              return;
            }
            start ??= timestamp;
            const value = Math.min(100, Math.floor((timestamp - start) / 9));
            percent(value);
            if (value === 100) finish();
            else requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
      } else {
        percent(100);
      }
      if (!active()) return;

      // ---- 阶段 5：就绪 ----
      await phrase(UI['boot-stable'], 'boot-conclusion');
      if (!active()) return;

      const ready = document.createElement('div');
      ready.className = 'boot-ready';
      ready.textContent = UI['boot-ready'];
      log.append(ready);
    } catch (error) {
      // 启动检测出错不应让整页失效：保留已有输出，并提示用户可以用 HELP。
      console.error('[boot.js] 启动检测中断：', error);
      if (P.bootJob === job) {
        const failed = document.createElement('div');
        failed.className = 'boot-conclusion';
        failed.textContent = UI['boot-interrupted'];
        log.append(failed);
      }
    } finally {
      if (P.bootJob === job) {
        P.bootJob = null;
        $('skip').disabled = true;
        $('status').textContent = UI['status-ready'];
        output.setAttribute('aria-busy', 'false');
        $('announcement').textContent = UI['announce-boot-complete'];
        output.scrollTop = output.scrollHeight;
      }
    }
  }

  window.startBoot = startBoot;
})();
