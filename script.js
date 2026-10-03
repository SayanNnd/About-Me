(() => {
  'use strict';

  /* ---------- tiny helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function cmdButton(label, cmd, className = 'cmdlink', quiet = false) {
    const b = make('button', className, label);
    b.type = 'button';
    b.dataset[quiet ? 'quiet' : 'cmd'] = cmd;
    return b;
  }

  const text = (t) => make('p', '', t);
  const err = (t) => make('p', 'err', t);
  const hint = (t) => make('p', 'hint', t);
  const note = (t) => make('p', 'note', t);

  /* ---------- page elements ---------- */
  const screen = $('#screen');
  const log = $('#history');
  const inputLine = $('.input-line');
  const input = $('#cmd');
  const menuBtn = $('#menu-btn');
  const menu = $('#menu');
  const nowEl = $('#now');

  const canHover = matchMedia('(hover: hover)').matches;   // false on most phones
  const scrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  /* ---------- views: copies of the markup already in the page ---------- */
  function grab(id) {
    const frag = document.createDocumentFragment();
    $$(`#${id} > :not(.prompt)`).forEach((node) => frag.append(node.cloneNode(true)));
    return () => frag.cloneNode(true);
  }

  function grabTemplate(id) {
    const tpl = $(`#${id}`);
    return () => (tpl ? tpl.content.cloneNode(true) : document.createDocumentFragment());
  }

  const views = {
    fastfetch: grab('fetch'),
    about: grab('about'),
    skills: grab('skills'),
    projects: grab('projects'),
    contact: grab('contact'),
    roadmap: grabTemplate('roadmap'),
  };

  // A re-run fastfetch should appear instantly instead of replaying the fade-in
  const firstFetch = views.fastfetch;
  views.fastfetch = () => {
    const copy = firstFetch();
    copy.firstElementChild.classList.add('now');
    return copy;
  };

  /* ---------- data read from the page ---------- */
  // Skills come from the <li data-skill> items in the skills section
  const skillList = $$('#skills .ls li').map((li) => ({
    slug: li.dataset.skill,
    label: li.textContent.trim(),
    names: [li.dataset.skill, li.textContent, ...(li.dataset.aliases || '').split(',')]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  }));

  const findSkill = (query) => skillList.find((s) => s.names.includes(query.trim().toLowerCase()));

  const links = Object.fromEntries(
    $$('#contact .contact p').map((p) => [$('.k', p).textContent.trim().toLowerCase(), $('a', p).href])
  );

  const lastSegment = (href) => new URL(href).pathname.split('/').filter(Boolean).pop() || '';
  const githubUser = links.github ? lastSegment(links.github) : '';
  const leetcodeUser = links.leetcode ? lastSegment(links.leetcode) : '';

  const tracks = $$('li', $('#music') ? $('#music').content : document.createDocumentFragment()).map((li) => {
    const src = li.dataset.src || '';
    return {
      src,
      title: li.textContent.trim(),
      artist: li.dataset.artist || '',
      slug: src.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase(),
    };
  });

  const quick = [
    { cmd: 'home',            desc: 'Show the whole page again' },
    { cmd: 'fastfetch',       desc: 'Info card' },
    { cmd: 'cat about.md',    desc: 'Who I am' },
    { cmd: 'cat roadmap.md',  desc: 'Where I am headed' },
    { cmd: 'ls skills',       desc: 'My skills, click one for its projects' },
    { cmd: 'ls projects',     desc: "What I've built" },
    { cmd: 'stats',           desc: 'Live GitHub and LeetCode stats' },
    { cmd: 'ls music',        desc: 'Tracks you can play' },
    { cmd: 'cat contact.txt', desc: 'Email, GitHub, LinkedIn, LeetCode' },
    { cmd: 'help',            desc: 'List every command' },
    { cmd: 'clear',           desc: 'Clear the screen' },
  ];

  const homeSteps = [
    ['fastfetch', 'fastfetch'],
    ['cat about.md', 'about'],
    ['ls ~/skills', 'skills'],
    ['ls ~/projects', 'projects'],
    ['cat contact.txt', 'contact'],
  ];

  /* ---------- printing ---------- */
  function promptLine(commandText) {
    const p = make('p', 'prompt');
    p.append(
      make('span', 'u', 'sayan@iiitg'),
      make('span', 'dir', '~'),
      make('span', 'sym', '\u276F'),
      ' ',
      make('span', 'cmd', commandText)
    );
    return p;
  }

  function print(commandText, ...nodes) {
    const entry = make('section', 'block entry');
    entry.append(promptLine(commandText), ...nodes);
    log.append(entry);
    return entry;
  }

  function reveal(entry) {
    const fits = entry.offsetHeight + inputLine.offsetHeight < screen.clientHeight;
    if (fits) {
      screen.scrollTo({ top: screen.scrollHeight, behavior: scrollBehavior });
    } else {
      const top = entry.getBoundingClientRect().top - screen.getBoundingClientRect().top + screen.scrollTop - 8;
      screen.scrollTo({ top, behavior: scrollBehavior });
    }
  }

  function clearScreen() {
    log.replaceChildren();
    screen.scrollTop = 0;
  }

  /* ---------- outputs that are built in JS ---------- */
  function helpView() {
    const wrap = make('div', 'out help');
    const rows = [
      ...quick.map((q) => ({ ...q, runnable: true })),
      { cmd: 'whoami', desc: 'Who is logged in', runnable: true },
      { cmd: 'pwd', desc: 'Where you are', runnable: true },
      { cmd: 'ls skills/<name>', desc: 'Projects that use a skill, e.g. ls skills/c-cpp' },
      { cmd: 'stats <name>', desc: 'Only one service: github or leetcode' },
      { cmd: 'play <track>', desc: 'Play a track by number or name. Also: pause, next, prev, stop, volume 0-100' },
      { cmd: 'open <name>', desc: `Open ${Object.keys(links).join(', ')}` },
    ];
    rows.forEach((row) => {
      const p = make('p');
      const k = make('span', 'k');
      if (row.runnable) k.append(cmdButton(row.cmd, row.cmd));
      else k.textContent = row.cmd;
      p.append(k, row.desc);
      wrap.append(p);
    });
    wrap.append(hint('Tip: Tab completes, the up and down arrows bring back earlier commands. about, roadmap, skills, projects, contact and music also work on their own.'));
    return wrap;
  }

  const files = ['about.md', 'roadmap.md', 'contact.txt'];

  function dirListing() {
    const wrap = make('div', 'out files');
    [
      ['about.md', 'cat about.md', 'file'],
      ['roadmap.md', 'cat roadmap.md', 'file'],
      ['skills/', 'ls skills', 'dir'],
      ['projects/', 'ls projects', 'dir'],
      ['music/', 'ls music', 'dir'],
      ['contact.txt', 'cat contact.txt', 'file'],
    ].forEach(([label, cmd, kind]) => wrap.append(cmdButton(label, cmd, `cmdlink ${kind}`)));
    return wrap;
  }

  // Projects that use one skill: copy the full project list, then remove the cards that don't match
  function skillProjects(query) {
    const skill = findSkill(query);
    if (!skill) {
      return [err(`No skill named "${query}".`), hint(`Available: ${skillList.map((s) => s.slug).join(', ')}`)];
    }

    const cards = views.projects();
    let count = 0;
    $$('.project', cards).forEach((card) => {
      if ((card.dataset.skills || '').split(' ').includes(skill.slug)) count++;
      else card.remove();
    });

    if (!count) {
      return [note(`No projects listed for ${skill.label} yet.`), hint('Run ls projects to see everything.')];
    }
    return [note(`${count} project${count === 1 ? '' : 's'} using ${skill.label}`), cards];
  }

  /* ---------- music player ---------- */
  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = 0.6;
  let current = -1;   // index of the loaded track, -1 = nothing loaded

  function renderNow() {
    nowEl.replaceChildren();
    if (current < 0) {
      nowEl.hidden = true;
      return;
    }
    nowEl.hidden = false;
    const paused = audio.paused;
    nowEl.append(
      make('span', 't', `${paused ? '\u275A\u275A' : '\u266A'} ${tracks[current].title}`),
      cmdButton(paused ? 'play' : 'pause', paused ? 'play' : 'pause', 'cmdlink', true),
      cmdButton('next', 'next', 'cmdlink', true),
      cmdButton('stop', 'stop', 'cmdlink', true)
    );
  }

  function startTrack(i) {
    current = i;
    audio.src = tracks[i].src;
    renderNow();
    return Promise.resolve(audio.play());
  }

  function stopPlayback() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    current = -1;
    renderNow();
  }

  // Start a track and return the line to print. If the file can't be loaded, the line turns into an error.
  function playIndex(i) {
    const t = tracks[i];
    const line = text(`\u266A Now playing: ${t.title}${t.artist ? ` (${t.artist})` : ''}`);
    startTrack(i).catch((e) => {
      if (e && e.name === 'AbortError') return;
      line.className = 'err';
      line.textContent = `Couldn't play ${t.src}. Check that the file is in the music folder.`;
      stopPlayback();
    });
    return [line];
  }

  function findTrack(query) {
    const q = query.trim().toLowerCase();
    if (/^\d+$/.test(q)) return Number(q) - 1 < tracks.length ? Number(q) - 1 : -1;
    const exact = tracks.findIndex((t) => t.slug === q || t.title.toLowerCase() === q);
    return exact >= 0 ? exact : tracks.findIndex((t) => t.slug.includes(q) || t.title.toLowerCase().includes(q));
  }

  const noTracks = () => [err('No tracks yet. Add files to the music folder and list them in index.html.')];

  function musicView() {
    if (!tracks.length) return noTracks();
    const wrap = make('div', 'out tracks');
    tracks.forEach((t, i) => {
      const p = make('p');
      const playingNow = i === current && !audio.paused;
      const btn = cmdButton('', `play ${i + 1}`, 'cmdlink track');
      btn.append(make('span', 'n', '\u25B6\uFE0E'), `${i + 1}  ${t.title}`);
      p.append(btn);
      if (t.artist) p.append(make('span', 'by', t.artist));
      wrap.append(p);
    });
    wrap.append(hint('Click a track or run play <name>. Control it with pause, next, prev, stop and volume.'));
    return [wrap];
  }

  audio.addEventListener('play', renderNow);
  audio.addEventListener('pause', renderNow);
  audio.addEventListener('ended', () => {
    if (tracks.length) startTrack((current + 1) % tracks.length).catch(stopPlayback);
  });
  if (tracks.length) {
    const randomTrack = Math.floor(Math.random() * tracks.length);
    startTrack(randomTrack).catch((error) => {
      if (error.name !== 'NotAllowedError') {
        console.error('Could not start music:', error);
        stopPlayback();
      }
    });
  }

  /* ---------- stats (GitHub + LeetCode) ---------- */
  async function cached(key, loader) {
    try {
      const hit = JSON.parse(sessionStorage.getItem(key));
      if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.v;
    } catch { /* storage unavailable or empty */ }
    const v = await loader();
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* ignore */ }
    return v;
  }

  const getJson = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (res.status === 403 || res.status === 429) throw new Error('rate-limited');
    if (!res.ok) throw new Error(`http ${res.status}`);
    return res.json();
  };

  async function loadGithub() {
    const [user, repos] = await Promise.all([
      getJson(`https://api.github.com/users/${githubUser}`),
      getJson(`https://api.github.com/users/${githubUser}/repos?per_page=100&type=owner`),
    ]);
    const own = repos.filter((r) => !r.fork);
    const langs = {};
    own.forEach((r) => { if (r.language) langs[r.language] = (langs[r.language] || 0) + 1; });
    return {
      repos: user.public_repos,
      stars: own.reduce((sum, r) => sum + r.stargazers_count, 0),
      followers: user.followers,
      langs: Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => `${name} (${n})`),
    };
  }

  const leetcodeSources = [
    (u) => `https://leetcode-stats.tashif.codes/${u}`,
    (u) => `https://leetcode-stats-api.herokuapp.com/${u}`,
  ];

  async function loadLeetcode() {
    for (const source of leetcodeSources) {
      try {
        const d = await getJson(source(leetcodeUser));
        if (typeof d.totalSolved === 'number' && d.status !== 'error') return d;
      } catch { /* try the next mirror */ }
    }
    throw new Error('unreachable');
  }

  const fmt = (n) => Number(n).toLocaleString('en-US');

  function statRow(label, value) {
    const p = make('p');
    p.append(make('span', 'k', label), value instanceof Node ? value : String(value));
    return p;
  }

  function difficultyRow(label, solved, total, color) {
    const frag = document.createDocumentFragment();
    frag.append(total ? `${fmt(solved)} / ${fmt(total)}` : fmt(solved));
    if (total) {
      const bar = make('span', 'bar');
      const fill = make('i');
      fill.style.width = `${Math.min(100, (solved / total) * 100)}%`;
      fill.style.background = `var(--${color})`;
      bar.append(fill);
      frag.append(bar);
    }
    return statRow(label, frag);
  }

  function githubRows(d) {
    const rows = [
      statRow('Repos', fmt(d.repos)),
      statRow('Stars', fmt(d.stars)),
      statRow('Followers', fmt(d.followers)),
    ];
    if (d.langs.length) rows.push(statRow('Top langs', d.langs.join(', ')));
    return rows;
  }

  function leetcodeRows(d) {
    const rows = [statRow('Solved', d.totalQuestions ? `${fmt(d.totalSolved)} / ${fmt(d.totalQuestions)}` : fmt(d.totalSolved))];
    if (typeof d.easySolved === 'number') rows.push(difficultyRow('Easy', d.easySolved, d.totalEasy, 'teal'));
    if (typeof d.mediumSolved === 'number') rows.push(difficultyRow('Medium', d.mediumSolved, d.totalMedium, 'amber'));
    if (typeof d.hardSolved === 'number') rows.push(difficultyRow('Hard', d.hardSolved, d.totalHard, 'coral'));
    if (d.ranking) rows.push(statRow('Ranking', fmt(d.ranking)));
    return rows;
  }

  // A block that says "Fetching..." and then swaps in the numbers (or a useful error)
  function statBlock(service, loader, toRows) {
    const href = links[service];
    const block = make('div', 'stat-block');
    const loading = make('p', 'hint', 'Fetching...');
    const url = new URL(href);
    block.append(make('p', 'head', `${url.host}${url.pathname}`.replace(/\/$/, '')), make('div', 'sep'), loading);

    cached(`stats:${service}`, loader)
      .then((data) => loading.replaceWith(...toRows(data)))
      .catch((e) => {
        const why = e && e.message === 'rate-limited' ? 'Rate limit reached. Try again in a bit.' : 'Could not load live stats right now.';
        loading.replaceWith(err(why), hint(`Run open ${service} to see the profile directly.`));
      })
      .finally(() => {
        // the block grew after it was printed, so keep the latest entry in view
        const last = log.lastElementChild;
        if (last && last.contains(block)) reveal(last);
      });

    return block;
  }

  /* ---------- paths---------- */
  function splitPath(arg) {
    const p = arg.replace(/^(~|\.)?\/?/, '').replace(/\/+$/, '');
    const m = p.match(/^([^/\s]+)[/\s]*(.*)$/);
    return m ? { dir: m[1].toLowerCase(), rest: m[2] } : { dir: '', rest: '' };
  }

  /* ---------- commands ---------- */
  const handlers = {
    help: () => [helpView()],

    home: () => {
      clearScreen();
      homeSteps.forEach(([cmd, view]) => print(cmd, views[view]()));
      return null;
    },

    clear: () => {
      clearScreen();
      return null;
    },

    fastfetch: () => [views.fastfetch()],
    neofetch: () => [views.fastfetch()],

    whoami: () => [text('Sayan'), hint('Sayan Nandi, EC-AI at IIIT Guwahati. Try fastfetch or cat about.md.')],
    pwd: () => [text('/home/sayan')],

    about: () => [views.about()],
    roadmap: () => [views.roadmap()],
    contact: () => [views.contact()],
    skills: ([query]) => (query ? skillProjects(query) : [views.skills()]),
    projects: (args) => (args.length ? skillProjects(args.join(' ')) : [views.projects()]),
    music: () => musicView(),

    cat: ([file = '']) => {
      const name = file.replace(/^(~\/|\.\/)/, '').toLowerCase();
      if (!name) return [err('cat: missing file. Try cat about.md, cat roadmap.md or cat contact.txt')];
      if (name === 'about.md') return [views.about()];
      if (name === 'roadmap.md') return [views.roadmap()];
      if (name === 'contact.txt') return [views.contact()];
      const bare = name.replace(/\/$/, '');
      if (['skills', 'projects', 'music'].includes(bare)) {
        return [err(`cat: ${file}: Is a directory`), hint(`Try ls ${bare}`)];
      }
      return [err(`cat: ${file}: No such file or directory`)];
    },

    ls: (args) => {
      const target = args.filter((a) => !a.startsWith('-')).join(' ');
      const { dir, rest } = splitPath(target);
      if (!dir) return [dirListing()];
      if (dir === 'skills') return rest ? skillProjects(rest) : [views.skills()];
      if (dir === 'projects') return rest ? skillProjects(rest) : [views.projects()];
      if (dir === 'music') return musicView();
      if (files.includes(dir)) return [text(dir)];
      return [err(`ls: cannot access '${target}': No such file or directory`)];
    },

    cd: () => [text('This is a one-page site, so there is nothing to cd into. Try ls to see what is here.')],

    stats: ([which = '']) => {
      const key = which.toLowerCase();
      if (key && !['github', 'leetcode'].includes(key)) return [err('Usage: stats [github|leetcode]')];
      const wrap = make('div', 'out stats');
      if ((!key || key === 'github') && githubUser) wrap.append(statBlock('github', loadGithub, githubRows));
      if ((!key || key === 'leetcode') && leetcodeUser) wrap.append(statBlock('leetcode', loadLeetcode, leetcodeRows));
      return wrap.children.length ? [wrap] : [err('No profile links found in the contact section.')];
    },

    play: (args) => {
      if (!tracks.length) return noTracks();
      const query = args.join(' ');
      if (!query) {
        if (current < 0) return playIndex(0);
        if (!audio.paused) return [text(`\u266A Already playing: ${tracks[current].title}`)];
        Promise.resolve(audio.play()).catch(() => {});
        return [text(`\u266A Resumed: ${tracks[current].title}`)];
      }
      const i = findTrack(query);
      if (i < 0) return [err(`No track matching "${query}".`), hint('Run ls music to see the list.')];
      return playIndex(i);
    },

    pause: () => {
      if (current < 0 || audio.paused) return [text('Nothing is playing.')];
      audio.pause();
      return [text('Paused. Run play to resume.')];
    },

    stop: () => {
      if (current < 0) return [text('Nothing is playing.')];
      stopPlayback();
      return [text('Stopped.')];
    },

    next: () => (tracks.length ? playIndex((current + 1) % tracks.length) : noTracks()),
    prev: () => (tracks.length ? playIndex((current <= 0 ? tracks.length : current) - 1) : noTracks()),

    volume: ([v]) => {
      if (v === undefined) return [text(`Volume ${Math.round(audio.volume * 100)}%`)];
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) return [err('Usage: volume <0-100>')];
      audio.volume = n / 100;
      return [text(`Volume ${n}%`)];
    },

    open: ([name = '']) => {
      const key = name.toLowerCase();
      if (!Object.hasOwn(links, key)) return [err(`Usage: open <${Object.keys(links).join('|')}>`)];
      if (key === 'email') location.href = links[key];
      else window.open(links[key], '_blank', 'noopener');
      return [text(`Opening ${key}...`)];
    },

    sudo: () => [err('sudo: permission denied. This portfolio is read-only.')],
  };

  /* ---------- running a command ---------- */
  const past = [];    
  let pastIndex = 0;     
  let draft = '';        

  function run(raw) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line) return;

    if (past[past.length - 1] !== line) past.push(line);
    pastIndex = past.length;
    draft = '';

    const [name, ...args] = line.split(' ');
    const key = name.toLowerCase();
    const nodes = Object.hasOwn(handlers, key)
      ? handlers[key](args)
      : [err(`zsh: command not found: ${name}`), hint('Type help to see what you can run.')];

    if (nodes) reveal(print(line, ...nodes));
  }

  // Run a command without printing anything (status bar buttons)
  function runQuiet(raw) {
    const [name, ...args] = raw.trim().split(/\s+/);
    if (Object.hasOwn(handlers, name)) handlers[name](args);
  }

  /* ---------- Tab completion ---------- */
  const argChoices = {
    ls: ['about.md', 'roadmap.md', 'skills/', 'projects/', 'music/', 'contact.txt', ...skillList.map((s) => `skills/${s.slug}`)],
    cat: ['about.md', 'roadmap.md', 'contact.txt'],
    open: Object.keys(links),
    stats: ['github', 'leetcode'],
    play: tracks.map((t) => t.slug),
    skills: skillList.map((s) => s.slug),
    projects: skillList.map((s) => s.slug),
  };

  const commonPrefix = (list) =>
    list.reduce((a, b) => {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      return a.slice(0, i);
    });

  function complete() {
    const parts = input.value.trimStart().split(/\s+/);
    const last = parts[parts.length - 1].toLowerCase();
    const pool = parts.length === 1 ? Object.keys(handlers) : argChoices[parts[0].toLowerCase()] || [];
    const hits = pool.filter((c) => c.startsWith(last));
    if (!hits.length) return;

    const prefix = commonPrefix(hits);
    parts[parts.length - 1] = prefix;
    const finished = hits.length === 1 && !prefix.endsWith('/');
    input.value = parts.join(' ') + (finished ? ' ' : '');
  }

  /* ---------- keyboard ---------- */
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      run(input.value);
      input.value = '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      complete();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (pastIndex === past.length) draft = input.value;
      if (pastIndex > 0) input.value = past[--pastIndex];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (pastIndex < past.length) {
        pastIndex++;
        input.value = pastIndex === past.length ? draft : past[pastIndex];
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      clearScreen();
    }
  });

  /* ---------- dropdown ---------- */
  quick.forEach(({ cmd, desc }) => {
    const item = cmdButton('', cmd, 'menu-item');
    item.append(make('span', 'mc', cmd), make('span', 'md', desc));
    menu.append(item);
  });

  function setMenu(open) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }

  menuBtn.addEventListener('click', () => setMenu(menu.hidden));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setMenu(false);
      menuBtn.focus();
    }
  });

  /* ---------- clicks ---------- */
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('.dropdown')) setMenu(false);

    // data-quiet buttons (status bar) run silently
    const quiet = e.target.closest('[data-quiet]');
    if (quiet) {
      runQuiet(quiet.dataset.quiet);
      return;
    }

    const trigger = e.target.closest('[data-cmd]');
    if (trigger) {
      setMenu(false);
      run(trigger.dataset.cmd);
      if (canHover) input.focus({ preventScroll: true });
    }
  });

  screen.addEventListener('click', (e) => {
    if (!canHover) return;
    if (getSelection().toString()) return;
    if (e.target.closest('a, button, input')) return;
    input.focus({ preventScroll: true });
  });

  if (canHover) input.focus({ preventScroll: true });
})();
