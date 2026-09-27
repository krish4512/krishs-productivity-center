const DURATIONS = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
    const MODE_LABEL = { focus: "Focus", short: "Short break", long: "Long break" };
    const C = 2 * Math.PI * 120;
    const KEY = "krish-productivity-v1";
    const STARTER = [
      { id: "welcome-1", text: "Open a 25-minute focus session", done: false, createdAt: 1 },
      { id: "welcome-2", text: "Name the one thing that matters today", done: false, createdAt: 2 },
    ];

    const todayKey = () => new Date().toISOString().slice(0, 10);
    const pad = (n) => String(n).padStart(2, "0");
    const clock = (s) => `${pad(Math.floor(Math.max(0, s) / 60))}:${pad(Math.max(0, s) % 60)}`;
    const escapeHtml = (s) => String(s)
      .replaceAll("&", "&" + "amp;")
      .replaceAll("<", "&" + "lt;")
      .replaceAll(">", "&" + "gt;")
      .replaceAll('"', "&" + "quot;")
      .replaceAll("'", "&#39;");

    let state = {
      tasks: STARTER,
      focusedTaskId: null,
      mode: "focus",
      remaining: DURATIONS.focus,
      running: false,
      endsAt: null,
      autoAdvance: true,
      muted: false,
      focusCountToday: 0,
      dayKey: todayKey(),
      cycleCount: 0,
      note: "",
    };
    let intervalId = null;
    let audioCtx = null;

    function persist() {
      localStorage.setItem(KEY, JSON.stringify({
        tasks: state.tasks,
        focusedTaskId: state.focusedTaskId,
        mode: state.mode,
        remaining: state.remaining,
        running: state.running,
        endsAt: state.endsAt,
        autoAdvance: state.autoAdvance,
        muted: state.muted,
        focusCountToday: state.focusCountToday,
        dayKey: state.dayKey,
        cycleCount: state.cycleCount,
      }));
    }

    function load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) Object.assign(state, JSON.parse(raw), { note: "" });
      } catch {}
      if (state.dayKey !== todayKey()) {
        state.focusCountToday = 0;
        state.dayKey = todayKey();
      }
      if (state.running && state.endsAt) {
        const remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
        if (remaining <= 0) finish(state.mode === "focus");
        else {
          state.remaining = remaining;
          startTicking();
        }
      } else {
        state.running = false;
        state.endsAt = null;
      }
      persist();
      render();
    }

    function unlockAudio() {
      audioCtx = audioCtx || new AudioContext();
      if (audioCtx.state === "suspended") audioCtx.resume();
    }
    function playChime() {
      if (state.muted) return;
      unlockAudio();
      const now = audioCtx.currentTime;
      [392, 523.25].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const start = now + i * 0.16;
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.07, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.72);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.78);
      });
    }

    function startTicking() {
      if (intervalId) return;
      intervalId = setInterval(tick, 250);
    }
    function stopTicking() {
      clearInterval(intervalId);
      intervalId = null;
    }
    function tick() {
      if (!state.running || !state.endsAt) return;
      const remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
      if (remaining <= 0) finish(state.mode === "focus");
      else if (remaining !== state.remaining) {
        state.remaining = remaining;
        if (state.dayKey !== todayKey()) {
          state.focusCountToday = 0;
          state.dayKey = todayKey();
        }
        renderTimer();
      }
    }

    function nextMode(mode, cycleCount) {
      if (mode === "focus") {
        const next = cycleCount + 1;
        return { mode: next % 4 === 0 ? "long" : "short", cycleCount: next };
      }
      return { mode: "focus", cycleCount };
    }

    function finish(countFocus, silent) {
      stopTicking();
      const advanced = nextMode(state.mode, state.cycleCount);
      if (countFocus && state.mode === "focus") state.focusCountToday += 1;
      state.note = silent ? "" : state.mode === "focus"
        ? (advanced.mode === "long" ? "Four sessions in. Take the long break." : "Session complete. A short rest.")
        : "Break over. Back to the desk.";
      if (!silent) playChime();
      if (countFocus) state.cycleCount = advanced.cycleCount;
      if (state.autoAdvance) state.mode = advanced.mode;
      state.remaining = DURATIONS[state.mode];
      state.running = false;
      state.endsAt = null;
      persist();
      render();
    }

    function remainingMs() {
      return state.running && state.endsAt ? Math.max(0, state.endsAt - Date.now()) : state.remaining * 1000;
    }

    function renderTimer() {
      const ms = remainingMs();
      const secs = Math.max(0, Math.ceil(ms / 1000));
      const duration = DURATIONS[state.mode];
      const progress = Math.min(1, Math.max(0, ms / (duration * 1000)));
      document.getElementById("clock").textContent = clock(secs);
      document.getElementById("mode-label").textContent = MODE_LABEL[state.mode];
      document.getElementById("status").textContent = state.running ? "In progress" : secs === duration ? "Ready" : "Paused";
      document.getElementById("ring").setAttribute("stroke-dashoffset", String(C * (1 - progress)));
      document.getElementById("play-btn").setAttribute("aria-label", state.running ? "Pause timer" : "Start timer");
      document.getElementById("icon-play").innerHTML = state.running
        ? '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'
        : '<polygon points="6 3 20 12 6 21 6 3"/>';
      document.title = state.running ? `${clock(secs)} · ${MODE_LABEL[state.mode]}` : "Krish's Productivity Center";
      document.querySelectorAll(".modes button").forEach((btn) => {
        btn.setAttribute("aria-selected", btn.dataset.mode === state.mode ? "true" : "false");
      });
      const dots = state.cycleCount % 4;
      [...document.getElementById("dots").children].forEach((el, i) => el.classList.toggle("on", i < dots));
      document.getElementById("today-count").textContent = String(state.focusCountToday);
      const word = state.focusCountToday === 1 ? "session" : "sessions";
      document.getElementById("today-count").nextSibling.textContent = ` focus ${word} today`;
    }

    function renderTasks() {
      const open = state.tasks.filter((t) => !t.done).length;
      const done = state.tasks.length - open;
      document.getElementById("open-count").textContent = `${open} open`;
      const list = document.getElementById("task-list");
      if (!state.tasks.length) {
        list.innerHTML = '<li class="empty"><p class="serif">A clear desk.</p><p class="sub">Add the first thing. Strike it when it is done.</p></li>';
      } else {
        list.innerHTML = state.tasks.map((task) => {
          const focused = state.focusedTaskId === task.id;
          return `<li class="task${task.done ? " done" : ""}" data-id="${task.id}">
            <button type="button" class="task-main" aria-pressed="${task.done}">
              <span class="check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>
              <span class="task-label">${escapeHtml(task.text)}</span>
            </button>
            <button type="button" class="icon-btn sm pin" aria-label="${focused ? "Unpin task" : "Pin task to timer"}" style="${focused ? "color:var(--fg)" : ""}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${focused ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 7.89 17h8.22a2 2 0 0 0 1.78-3.55l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1z"/></svg>
            </button>
            <button type="button" class="icon-btn sm danger del" aria-label="Delete ${escapeHtml(task.text)}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </li>`;
        }).join("");
      }
      const doneRow = document.getElementById("done-row");
      doneRow.hidden = done === 0;
      document.getElementById("done-count").textContent = `${done} complete`;
      const pinned = state.tasks.find((t) => t.id === state.focusedTaskId && !t.done);
      const pinEl = document.getElementById("pinned");
      pinEl.textContent = pinned ? pinned.text : "Pin a task to keep it in view.";
      pinEl.classList.toggle("pinned", Boolean(pinned));
    }

    function render() {
      renderTimer();
      renderTasks();
      document.getElementById("auto-btn").setAttribute("aria-pressed", state.autoAdvance ? "true" : "false");
      document.getElementById("mute-btn").setAttribute("aria-label", state.muted ? "Unmute chime" : "Mute chime");
      document.getElementById("icon-vol").innerHTML = state.muted
        ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>'
        : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
      const note = document.getElementById("note");
      note.hidden = !state.note;
      note.textContent = state.note;
    }

    document.getElementById("today").textContent = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

    document.querySelectorAll(".modes button").forEach((btn) => {
      btn.addEventListener("click", () => {
        stopTicking();
        state.mode = btn.dataset.mode;
        state.remaining = DURATIONS[state.mode];
        state.running = false;
        state.endsAt = null;
        state.note = "";
        persist();
        render();
      });
    });

    document.getElementById("play-btn").addEventListener("click", () => {
      if (state.running) {
        stopTicking();
        state.remaining = state.endsAt ? Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)) : state.remaining;
        state.running = false;
        state.endsAt = null;
      } else {
        unlockAudio();
        state.endsAt = Date.now() + state.remaining * 1000;
        state.running = true;
        state.note = "";
        startTicking();
      }
      persist();
      render();
    });
    document.getElementById("reset-btn").addEventListener("click", () => {
      stopTicking();
      state.remaining = DURATIONS[state.mode];
      state.running = false;
      state.endsAt = null;
      state.note = "";
      persist();
      render();
    });
    document.getElementById("skip-btn").addEventListener("click", () => finish(false, true));
    document.getElementById("mute-btn").addEventListener("click", () => { state.muted = !state.muted; persist(); render(); });
    document.getElementById("auto-btn").addEventListener("click", () => { state.autoAdvance = !state.autoAdvance; persist(); render(); });

    const input = document.getElementById("new-task");
    const addBtn = document.getElementById("add-btn");
    input.addEventListener("input", () => { addBtn.disabled = !input.value.trim(); });
    document.getElementById("add-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      state.tasks.unshift({ id: crypto.randomUUID(), text, done: false, createdAt: Date.now() });
      input.value = "";
      addBtn.disabled = true;
      persist();
      render();
    });
    document.getElementById("task-list").addEventListener("click", (e) => {
      const li = e.target.closest(".task");
      if (!li) return;
      const id = li.dataset.id;
      if (e.target.closest(".del")) {
        state.tasks = state.tasks.filter((t) => t.id !== id);
        if (state.focusedTaskId === id) state.focusedTaskId = null;
      } else if (e.target.closest(".pin")) {
        state.focusedTaskId = state.focusedTaskId === id ? null : id;
      } else if (e.target.closest(".task-main")) {
        state.tasks = state.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t);
      } else return;
      persist();
      render();
    });
    document.getElementById("clear-btn").addEventListener("click", () => {
      const gone = state.tasks.find((t) => t.id === state.focusedTaskId);
      state.tasks = state.tasks.filter((t) => !t.done);
      if (gone && gone.done) state.focusedTaskId = null;
      persist();
      render();
    });

    window.addEventListener("keydown", (e) => {
      if (e.code !== "Space") return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      e.preventDefault();
      document.getElementById("play-btn").click();
    });

    let raf = 0;
    function loop() {
      if (state.running) renderTimer();
      raf = requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    load();
