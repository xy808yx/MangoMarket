import { play } from './sfx.js';

/* Mango Market UI widgets: keypad, column scaffold, bill chips, toast,
   confetti. Dumb components; store.js owns the flow and the pedagogy.
   The only sound here is the neutral keypad tick: result sounds belong to
   the flow controllers, and a wrong answer stays silent everywhere.

   House rules that live here:
   - The keypad is a 3x4 PHONE grid (1-2-3 / 4-5-6 / 7-8-9 / back-0-go),
     never an ordered 0-9 row (an ordered row is a number line she can walk).
   - The column widget renders engine columns(m, s) verbatim; borrow marks
     appear only when the caller asks (stage 0 and assisted walks). */

export function makeKeypad(el, handlers) {
  el.innerHTML = '';
  el.className = 'keypad';
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'go'];
  const btns = {};
  /* The go key dims via a class instead of the disabled attribute so a tap
     on a not-ready checkmark can still answer (disabled buttons swallow
     pointer events and read as a frozen game to a young player). handlers.hintGo
     pulses the ready checkmark until her first go tap teaches the
     type-then-confirm rhythm. */
  let goOn = false;
  for (const k of KEYS) {
    const b = document.createElement('button');
    b.className = 'key' + (k === 'go' ? ' key-go' : k === 'back' ? ' key-back' : '');
    b.textContent = k === 'go' ? '✓' : k === 'back' ? '⌫' : k;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (b.disabled) return;
      play('tick');
      if (k === 'go') {
        b.classList.remove('hint');
        handlers.hintGo = false;
        if (!goOn) handlers.onEmptySubmit && handlers.onEmptySubmit();
        else handlers.onSubmit && handlers.onSubmit();
      } else if (k === 'back') handlers.onBack && handlers.onBack();
      else handlers.onDigit && handlers.onDigit(Number(k));
    });
    btns[k] = b;
    el.appendChild(b);
  }
  return {
    el,
    setGo(enabled) {
      goOn = enabled;
      btns.go.classList.toggle('off', !enabled);
      btns.go.classList.toggle('hint', enabled && !!handlers.hintGo);
    },
    shake(k) {
      const b = btns[String(k)];
      if (!b) return;
      b.classList.remove('shake');
      void b.offsetWidth;
      b.classList.add('shake');
    }
  };
}

/* Column subtraction widget. cols comes from engine columns(m, s), right to
   left; we render most-significant on the left. Entry is enforced right to
   left. opts.marks shows the borrow crutch (crossed-out tops, lent tens). */
export function makeColumn(el, cols, opts = {}) {
  const n = cols.length;
  el.innerHTML = '';
  el.className = 'column';
  el.style.setProperty('--cols', n);

  const cells = [];
  const markRow = document.createElement('div');
  markRow.className = 'col-row col-marks';
  const topRow = document.createElement('div');
  topRow.className = 'col-row col-top';
  const botRow = document.createElement('div');
  botRow.className = 'col-row col-bot';
  const ansRow = document.createElement('div');
  ansRow.className = 'col-row col-ans';

  const sign = document.createElement('span');
  sign.className = 'col-sign';
  sign.textContent = '−';
  botRow.appendChild(sign);
  markRow.appendChild(document.createElement('span'));
  topRow.appendChild(document.createElement('span'));
  ansRow.appendChild(document.createElement('span'));

  for (let i = n - 1; i >= 0; i--) {
    const c = cols[i];
    const mark = document.createElement('span');
    mark.className = 'col-mark';
    const top = document.createElement('span');
    top.className = 'col-digit';
    top.textContent = c.top;
    const bot = document.createElement('span');
    bot.className = 'col-digit';
    bot.textContent = i < colsOfBottom(cols) ? c.bottom : '';
    const ans = document.createElement('span');
    ans.className = 'col-box';
    markRow.appendChild(mark);
    topRow.appendChild(top);
    botRow.appendChild(bot);
    ansRow.appendChild(ans);
    cells[i] = { mark, top, ans, col: c };
  }

  const rule = document.createElement('div');
  rule.className = 'col-rule';
  el.append(markRow, topRow, botRow, rule, ansRow);

  const entered = new Array(n).fill(null);
  let active = 0;

  /* opts.onMark(i, shown, col) lets the caller narrate the borrow crutch in
     words. The already-marked guard matters: paint() reruns showMarks on
     every keystroke, so without it the callback fires on each digit. */
  function showMarks(i) {
    const c = cells[i].col;
    if (!c.borrowIn && !c.borrowOut) return;
    if (cells[i].mark.textContent !== '') return;
    const shown = c.top - c.borrowIn + c.borrowOut * 10;
    cells[i].top.classList.add('crossed');
    cells[i].mark.textContent = shown;
    cells[i].mark.classList.add('pop');
    if (opts.onMark) opts.onMark(i, shown, c);
  }

  function paint() {
    for (let i = 0; i < n; i++) {
      cells[i].ans.classList.toggle('active', i === active);
      cells[i].ans.textContent = entered[i] === null ? '' : entered[i];
    }
    if (opts.marks && active < n) showMarks(active);
  }
  paint();

  return {
    el,
    enter(d) {
      if (active >= n) return false;
      entered[active] = d;
      active = Math.min(n, active + 1);
      paint();
      return true;
    },
    back() {
      if (active > 0 && (active >= n || entered[active] === null)) active--;
      entered[active] = null;
      paint();
    },
    filled() { return entered.every(d => d !== null); },
    digits() { return entered.map(d => d || 0); },
    reset() {
      entered.fill(null);
      active = 0;
      for (const c of cells) {
        c.top.classList.remove('crossed');
        c.mark.textContent = '';
      }
      paint();
    },
    /* Assisted walk support: focus a column, ghost its correct digit,
       always with marks. Returns the digit the keypad must accept. */
    guide(i) {
      active = i;
      showMarks(i);
      for (let k = 0; k < n; k++) cells[k].ans.classList.toggle('active', k === i);
      cells[i].ans.classList.add('ghost');
      cells[i].ans.textContent = cells[i].col.digit;
      return cells[i].col.digit;
    },
    confirm(i) {
      entered[i] = cells[i].col.digit;
      cells[i].ans.classList.remove('ghost');
      cells[i].ans.classList.add('done');
    }
  };
}

function colsOfBottom(cols) {
  let n = 0, v = 0;
  for (let i = cols.length - 1; i >= 0; i--) {
    if (cols[i].bottom > 0) { n = i + 1; break; }
  }
  /* At least one digit of the subtrahend always shows. */
  return Math.max(1, n);
}

/* Greedy whole-dollar bill decomposition. NO COINS exist in this game. */
export function billsFor(total) {
  const out = [];
  for (const d of [100, 50, 20, 10, 5, 1]) {
    while (total >= d) { out.push(d); total -= d; }
  }
  return out;
}

export function renderBills(el, total) {
  el.innerHTML = '';
  el.className = 'bills';
  for (const d of billsFor(total)) {
    const b = document.createElement('span');
    b.className = 'bill bill-' + d;
    b.textContent = '$' + d;
    el.appendChild(b);
  }
}

/* Bill drawer for big stand tenders (Phase 4). Change is made the real
   cashier way: count UP from the total to the bill by handing over bills.
   Dumb widget: renders the drawer, the running count and the tray;
   stand.js owns the rules (refusing overshoot, misses, the assisted walk).
   Bills fire on pointerdown like keypad keys, for the same snappy feel. */
export const DRAWER_DENOMS = [50, 20, 10, 5, 1];

export function makeDrawer(el, { start, target, onBill }) {
  el.innerHTML = '';
  el.className = 'drawer';
  const count = document.createElement('div');
  count.className = 'drawer-count';
  const goal = document.createElement('div');
  goal.className = 'drawer-goal';
  /* "Make it $50" reads as make the tray hold $50. The tray holds only what
     she hands back ($38 on a $12 sale paid with $50); it is the COUNT that
     climbs. Saying it the other way would teach change = tender. */
  goal.textContent = 'Get to $' + target;
  const row = document.createElement('div');
  row.className = 'drawer-bills';
  const tray = document.createElement('div');
  tray.className = 'drawer-tray';
  const btns = {};
  for (const d of DRAWER_DENOMS) {
    const b = document.createElement('button');
    b.className = 'bill bill-' + d + ' drawer-bill';
    b.textContent = '$' + d;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!b.disabled) onBill(d);
    });
    btns[d] = b;
    row.appendChild(b);
  }
  el.append(count, goal, row, tray);

  function setCount(n) {
    count.textContent = '$' + n;
    count.classList.remove('pop');
    void count.offsetWidth;
    count.classList.add('pop');
  }
  setCount(start);

  return {
    el,
    setCount,
    addBill(d) {
      const b = document.createElement('span');
      b.className = 'bill bill-' + d;
      b.textContent = '$' + d;
      tray.appendChild(b);
    },
    highlight(d) {
      for (const k of Object.keys(btns)) {
        btns[k].classList.toggle('hint', Number(k) === d);
      }
    },
    shake(d) {
      const b = btns[d];
      if (!b) return;
      b.classList.remove('shake');
      void b.offsetWidth;
      b.classList.add('shake');
    }
  };
}

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function confetti(count = 26) {
  const host = document.getElementById('confetti');
  const colors = ['#FFAD1F', '#F04E3E', '#3E8E4E', '#6EC9E8', '#F6B8C4'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'conf';
    p.style.left = 10 + Math.random() * 80 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.4 + 's';
    p.style.animationDuration = 1.1 + Math.random() * 0.9 + 's';
    p.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
    host.appendChild(p);
    setTimeout(() => p.remove(), 2600);
  }
}
