// Draws the pet, handles the bubble and clicks
const petEl = document.getElementById('pet');
const sprite = document.getElementById('sprite');
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
const bubbleSub = document.getElementById('bubble-sub');

let character = 'cat';
let state = 'sit';
let facing = 1;
let drawn = '';
let sayTimer = null;
let L = window.I18N.ko;
let lastAsk = null;

function render() {
  const key = character + ':' + state;
  if (key !== drawn) {
    sprite.innerHTML = (window.CHARS[character] || window.CHARS.cat)[state];
    drawn = key;
  }
  petEl.className = 'hit ' + state;
  // the run sprite faces right; flip when moving left
  sprite.style.transform = state === 'run' && facing < 0 ? 'scaleX(-1)' : '';
}

window.pet.on('character', (c) => { character = c; render(); });
window.pet.on('state', (s) => { state = s.state; facing = s.facing; render(); });

window.pet.on('say', ({ text, ms }) => {
  if (bubble.classList.contains('asking')) return;
  clearTimeout(sayTimer);
  bubbleText.textContent = text;
  bubbleSub.textContent = '';
  bubble.classList.remove('hidden');
  sayTimer = setTimeout(() => bubble.classList.add('hidden'), ms);
});

const nameInput = document.getElementById('name-input');
const btnLast = document.getElementById('btn-last');
const btnSave = document.getElementById('btn-save');
const closeBtn = document.getElementById('close');

function applyLang() {
  nameInput.placeholder = L.placeholder;
  nameInput.setAttribute('aria-label', L.inputLabel);
  btnSave.textContent = L.save;
  btnLast.textContent = L.last;
  closeBtn.setAttribute('aria-label', L.close);
  closeBtn.title = L.close;
}
window.pet.on('lang', (code) => {
  L = window.I18N[code] || window.I18N.en;
  document.documentElement.lang = code;
  applyLang();
});
applyLang();

window.pet.on('ask', ({ count, last, fallback }) => {
  clearTimeout(sayTimer);
  const first = !bubble.classList.contains('asking');
  bubbleText.textContent = L.askTitle;
  bubbleSub.textContent = L.askSub(count, fallback);
  btnLast.hidden = !last;
  btnLast.title = last ? L.lastTitle(last) : '';
  if (first) nameInput.value = '';
  bubble.classList.add('asking');
  bubble.classList.remove('hidden');
});

window.pet.on('ask-close', () => {
  bubble.classList.remove('asking');
  bubble.classList.add('hidden');
  nameInput.blur();
});

const save = () => window.pet.choose({ choice: 'name', name: nameInput.value });
document.getElementById('btn-save').addEventListener('click', save);
btnLast.addEventListener('click', () => window.pet.choose({ choice: 'last' }));
nameInput.addEventListener('mousedown', () => window.pet.focusInput());
nameInput.addEventListener('input', () => window.pet.typing());
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) save();
  if (e.key === 'Escape') window.pet.choose({ choice: 'name', name: '' });
});
closeBtn.addEventListener('click', (e) => { e.stopPropagation(); window.pet.hide(); });

// drag the pet to move it
petEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || e.target.closest('#close')) return;
  window.pet.drag(true);
});
window.addEventListener('mouseup', () => window.pet.drag(false));

// only the pet and bubble take clicks; transparent areas pass through
let ignoring = true;
document.addEventListener('mousemove', (e) => {
  const overPet = !!e.target.closest('.hit:not(.hidden)');
  if (overPet === ignoring) {
    ignoring = !overPet;
    window.pet.setIgnore(ignoring);
  }
});
document.addEventListener('mouseleave', () => {
  if (!ignoring) { ignoring = true; window.pet.setIgnore(true); }
});

render();
window.pet.ready();
