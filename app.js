const $ = (s) => document.querySelector(s);
const words = KM_DATA.words, defs = KM_DATA.definitions, all = [...words, ...defs];
const STORE = 'km2_local_v2';
const TOTAL = all.length;
const DEADLINE = new Date(2026, 10, 28, 23, 59, 0, 0); // local time on participant's device
let state = {};
let session = null;
let expired = false;

try { state = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (_) { state = {}; }
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); }
  catch (_) { alert('Не удалось сохранить прогресс. Проверь настройки хранения браузера.'); }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function key(item) { return `${item.kind}:${item.term}`; }
function normalizeAnswer(value) {
  return String(value ?? '').toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е').replace(/\u00a0/g, ' ')
    .replace(/^[\s.,;:!?'"«»()]+|[\s.,;:!?'"«»()]+$/g, '')
    .replace(/\s+/g, ' ').trim();
}
function isCorrectWrittenAnswer(value, officialAnswer) {
  // Only exact official translation(s) are accepted. Slash-separated alternatives
  // are explicitly listed in the source vocabulary document; no fuzzy matching.
  return String(officialAnswer).split('/').some(part => normalizeAnswer(value) === normalizeAnswer(part));
}
function lockSite() {
  if (expired) return;
  expired = true;
  session = null;
  $('#welcome').hidden = true;
  $('#dashboard').hidden = true;
  $('#workspace').hidden = true;
  $('#deadlineOverlay').hidden = false;
  document.querySelectorAll('button,input').forEach(el => { el.disabled = true; });
  $('#countdown').textContent = 'Доступ завершён';
}
function countdown() {
  const remaining = DEADLINE.getTime() - Date.now();
  if (remaining <= 0) { lockSite(); return; }
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor(remaining % 86400000 / 3600000);
  const minutes = Math.floor(remaining % 3600000 / 60000);
  const seconds = Math.floor(remaining % 60000 / 1000);
  $('#countdown').textContent = `${days}д ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}
countdown();
const countdownTimer = window.setInterval(() => {
  countdown();
  if (expired) window.clearInterval(countdownTimer);
}, 1000);

function init() {
  if (expired) return;
  if (state.name) {
    $('#welcome').hidden = true;
    $('#dashboard').hidden = false;
    $('#userName').textContent = state.name;
    refreshStats();
  }
}
$('#nameForm').addEventListener('submit', e => {
  e.preventDefault();
  if (expired) return;
  const name = $('#nickname').value.trim();
  if (!name) return;
  state.name = name.slice(0, 24); save(); init();
});
$('#resetProgress').onclick = () => {
  if (expired) return;
  if (confirm('Точно сбросить прогресс, результаты и историю ошибок на этом устройстве? Никнейм останется прежним. Это действие нельзя отменить.')) {
    const fixedName = state.name || '';
    state = {name: fixedName}; session = null; save();
    $('#workspace').hidden = true; $('#dashboard').hidden = false;
    $('#userName').textContent = fixedName; refreshStats();
  }
};
function accuracy(items) {
  const stats = state.itemStats || {};
  const total = items.reduce((n, item) => n + (stats[key(item)]?.attempts || 0), 0);
  const correct = items.reduce((n, item) => n + (stats[key(item)]?.correct || 0), 0);
  return total ? `${Math.round(correct / total * 100)}%` : '-';
}
function readiness() {
  const mastered = state.mastered || {};
  return Math.round(all.reduce((n, item) => n + (mastered[key(item)] ? 1 : 0), 0) / TOTAL * 100);
}
function refreshStats() {
  const mastered = state.mastered || {};
  const learned = all.filter(item => mastered[key(item)]).length;
  const pct = Math.round(learned / TOTAL * 100);
  $('#learned').textContent = learned;
  $('#accuracy').textContent = state.total ? `${Math.round((state.correct || 0) / state.total * 100)}%` : '-';
  $('#tests').textContent = state.tests || 0;
  $('#wordAccuracy').textContent = accuracy(words);
  $('#defAccuracy').textContent = accuracy(defs);
  $('#mistakeCount').textContent = (state.mistakes || []).length;
  $('#readinessValue').textContent = `${pct}%`;
  $('#readinessFill').style.width = `${pct}%`;
  $('#readinessCard').dataset.level = pct <= 40 ? 'low' : pct <= 80 ? 'mid' : pct <= 95 ? 'high' : 'ready';
  $('#readinessCaption').textContent = `${learned} из ${TOTAL} карточек отвечены правильно хотя бы в последней попытке`;
}
function showView(view) {
  if (expired) return;
  $('#dashboard').hidden = true; $('#workspace').hidden = false;
  const titles = {
    study:['РАЗДЕЛ 01','Изучение по порядку','Проходи материал последовательно небольшими блоками. После каждого блока из 10 заданий - зачёт.'],
    marathon:['РАЗДЕЛ 02','Марафон всех слов и терминов','Все уникальные карточки в случайном порядке. Для лексики можно выбрать вариант или ввести точный перевод на русском.'],
    glossary:['РАЗДЕЛ 03','Глоссарий','Все уникальные слова и определения из двух учебных документов.'],
    mistakes:['ПОВТОРЕНИЕ','Работа над ошибками','Повтори карточки, в которых ранее ошибался. После правильного ответа карточка исчезнет из этого списка.']
  };
  $('#workKicker').textContent = titles[view][0]; $('#workTitle').textContent = titles[view][1]; $('#workDesc').textContent = titles[view][2];
  if (view === 'glossary') renderGlossary();
  else if (view === 'study') startStudy();
  else if (view === 'mistakes') startMistakes();
  else startMarathon();
}
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => showView(button.dataset.view));
$('#back').onclick = () => {
  if (expired) return;
  $('#workspace').hidden = true; $('#dashboard').hidden = false; refreshStats();
};
function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function makeOptions(item, pool) {
  return shuffle([item, ...shuffle(pool.filter(x => x !== item)).slice(0, 3)]);
}
function startStudy() { session = {mode:'study',items:all,index:0,correct:0,answered:false,blockCorrect:0}; renderQuestion(); }
function startMarathon() {
  let order = shuffle(all), previous = state.lastMarathon || [];
  if (order.length > 1 && order.every((item, i) => key(item) === previous[i])) order.push(order.shift());
  state.lastMarathon = order.map(key); save();
  session = {mode:'marathon',items:order,index:0,correct:0,answered:false}; renderQuestion();
}
function startMistakes() {
  const items = (state.mistakes || []).map(k => all.find(item => key(item) === k)).filter(Boolean);
  if (!items.length) {
    $('#workArea').innerHTML = '<div class="result"><div class="score">✓</div><h3>Ошибок пока нет</h3><p class="muted">Здесь появятся карточки, на которые ты ответишь неправильно.</p><button class="primary" id="home">На главную</button></div>';
    $('#home').onclick = () => $('#back').click(); return;
  }
  session = {mode:'mistakes',items:shuffle(items),index:0,correct:0,answered:false}; renderQuestion();
}
function promptFor(item) {
  return item.kind === 'word'
    ? {label:'ПЕРЕВЕДИ НА РУССКИЙ',text:item.term,answer:item.meaning,pool:words}
    : {label:'УЗНАЙ ТЕРМИН ПО ОПРЕДЕЛЕНИЮ',text:item.meaning,answer:item.term,pool:defs};
}
function renderQuestion() {
  if (expired || !session) return;
  const s = session, item = s.items[s.index], prompt = promptFor(item);
  const total = s.items.length, pct = Math.round(s.index / total * 100);
  const typed = s.mode === 'marathon' && item.kind === 'word';
  const options = makeOptions(item, prompt.pool); s.options = options; s.selected = null; s.answered = false;
  $('#workArea').innerHTML = `<div class="question"><div class="qmeta"><span>${s.mode==='study'?'ИЗУЧЕНИЕ ПО ПОРЯДКУ':s.mode==='mistakes'?'РАБОТА НАД ОШИБКАМИ':'МАРАФОН'}</span><span>${s.index+1} / ${total}</span></div><div class="progressline"><span style="width:${pct}%"></span></div><div class="prompt-label">${prompt.label}</div><div class="prompt">${escapeHtml(prompt.text)}</div><div class="answers">${options.map((option,i)=>`<button class="answer" data-opt="${i}">${escapeHtml(option.kind==='word'?option.meaning:option.term)}</button>`).join('')}</div>${typed?'<div class="prompt-label">ИЛИ ВПИШИ ТОЧНЫЙ ПЕРЕВОД НА РУССКОМ</div><input class="typed" id="typed" placeholder="Перевод строго по списку" autocomplete="off" autocapitalize="off">':''}<div id="feedback"></div><div class="actions"><button class="secondary" id="skip">Пропустить</button><button class="primary" id="next" disabled>Ответить</button></div></div>`;
  document.querySelectorAll('[data-opt]').forEach(button => button.onclick = () => {
    if (s.answered) return;
    document.querySelectorAll('[data-opt]').forEach(x => x.classList.remove('selected'));
    button.classList.add('selected'); s.selected = options[Number(button.dataset.opt)];
    if ($('#typed')) $('#typed').value = '';
    $('#next').disabled = false; $('#next').textContent = 'Ответить';
  });
  if (typed) $('#typed').oninput = () => {
    if (s.answered) return;
    s.selected = null; document.querySelectorAll('[data-opt]').forEach(x => x.classList.remove('selected'));
    $('#next').disabled = !$('#typed').value.trim(); $('#next').textContent = 'Ответить';
  };
  $('#next').onclick = () => s.answered ? advance() : checkAnswer();
  $('#skip').onclick = () => {
    if (!s.answered) { record(item,false); showFeedback(false,prompt.answer,'Пропуск'); s.answered=true; disableAnswers(); $('#next').disabled=false; $('#next').textContent='Далее'; }
    else advance();
  };
}
function disableAnswers() { document.querySelectorAll('[data-opt]').forEach(button => button.disabled = true); if ($('#typed')) $('#typed').disabled = true; }
function checkAnswer() {
  const s = session, item = s.items[s.index], prompt = promptFor(item);
  const typed = $('#typed')?.value.trim(), chosen = s.selected;
  const ok = typed ? isCorrectWrittenAnswer(typed, prompt.answer) : !!chosen && key(chosen) === key(item);
  record(item, !!ok); s.answered = true;
  if (ok) { s.correct++; if (s.mode === 'study') s.blockCorrect++; }
  showFeedback(!!ok,prompt.answer,typed || (chosen ? (chosen.kind==='word'?chosen.meaning:chosen.term) : ''));
  document.querySelectorAll('[data-opt]').forEach((button,i) => {
    button.disabled = true;
    if (key(s.options[i]) === key(item)) button.classList.add('correct');
    else if (s.options[i] === chosen) button.classList.add('wrong');
  });
  if ($('#typed')) $('#typed').disabled = true;
  $('#next').disabled = false; $('#next').textContent = s.index === s.items.length-1 ? 'Завершить' : 'Далее';
}
function record(item, correct) {
  const itemKey = key(item);
  if (session) {
    session.kindTotal = session.kindTotal || {word:0,definition:0};
    session.kindCorrect = session.kindCorrect || {word:0,definition:0};
    session.kindTotal[item.kind]++; if (correct) session.kindCorrect[item.kind]++;
  }
  state.progress = state.progress || {}; state.mastered = state.mastered || {};
  state.itemStats = state.itemStats || {};
  const stats = state.itemStats[itemKey] || {attempts:0,correct:0};
  stats.attempts++; if (correct) stats.correct++; state.itemStats[itemKey] = stats;
  if (correct) { state.progress[itemKey] = true; state.mastered[itemKey] = true; }
  else { delete state.progress[itemKey]; delete state.mastered[itemKey]; }
  state.mistakes = state.mistakes || [];
  if (correct) state.mistakes = state.mistakes.filter(k => k !== itemKey);
  else if (!state.mistakes.includes(itemKey)) state.mistakes.push(itemKey);
  state.total = (state.total || 0) + 1; if (correct) state.correct = (state.correct || 0) + 1;
  save();
}
function showFeedback(correct, answer, given) {
  $('#feedback').innerHTML = `<div class="feedback ${correct?'good':'bad'}">${correct?'Верно!':'Правильный ответ: '}<strong>${escapeHtml(answer)}</strong>${!correct&&given?`<br><small>Твой ответ: ${escapeHtml(given)}</small>`:''}</div>`;
}
function advance() {
  const s = session; s.index++;
  if (s.mode === 'study' && s.index % 10 === 0 && s.index < s.items.length) { showBlockResult(); return; }
  if (s.index >= s.items.length) { showFinal(); return; }
  renderQuestion();
}
function showBlockResult() {
  const s = session, correct = s.blockCorrect; s.blockCorrect = 0;
  state.tests = (state.tests || 0) + 1; save();
  $('#workArea').innerHTML = `<div class="result"><div class="eyebrow">ПРОМЕЖУТОЧНЫЙ ЗАЧЁТ</div><div class="score">${correct}/10</div><h3>Блок завершён</h3><p class="muted">Правильных ответов: ${correct} из 10.</p><div class="result-actions"><button class="primary" id="continue">Следующие 10 →</button><button class="secondary" id="restart">Начать сначала</button></div></div>`;
  $('#continue').onclick = renderQuestion; $('#restart').onclick = startStudy;
}
function showFinal() {
  const s = session; state.tests = (state.tests || 0) + 1;
  const pct = Math.round(s.correct / s.items.length * 100);
  const wordCount = s.kindTotal?.word || 0, defCount = s.kindTotal?.definition || 0;
  const wordRight = s.kindCorrect?.word || 0, defRight = s.kindCorrect?.definition || 0;
  state.lastSessionStats = {mode:s.mode,score:s.correct,total:s.items.length,words:wordCount,definitions:defCount,date:new Date().toISOString()};
  save(); refreshStats();
  const title = s.mode==='study'?'ИЗУЧЕНИЯ':s.mode==='mistakes'?'ПОВТОРЕНИЯ ОШИБОК':'МАРАФОНА';
  $('#workArea').innerHTML = `<div class="result"><div class="eyebrow">РЕЗУЛЬТАТ ${title}</div><div class="score">${s.correct}/${s.items.length}</div><h3>${pct>=90?'Превосходно!':pct>=70?'Хороший результат!':'Есть куда расти - повторение поможет.'}</h3><p class="muted">Правильных ответов: ${pct}%. Пройдено заданий: ${s.items.length}.</p>${s.mode==='marathon'?`<div class="split-results"><div><span>Слова и выражения</span><strong>${wordRight}/${wordCount} · ${wordCount?Math.round(wordRight/wordCount*100):0}%</strong></div><div><span>Определения</span><strong>${defRight}/${defCount} · ${defCount?Math.round(defRight/defCount*100):0}%</strong></div></div>`:''}<div class="result-actions"><button class="primary" id="again">Пройти ещё раз</button><button class="secondary" id="home">На главную</button></div></div>`;
  $('#again').onclick = () => s.mode==='study'?startStudy():s.mode==='mistakes'?startMistakes():startMarathon();
  $('#home').onclick = () => $('#back').click();
}
function renderGlossary() {
  const rows = [
    ...words.map(item => ({term:item.term,expansion:item.expansion,detail:item.meaning,type:'Слово',kind:'word'})),
    ...defs.map(item => ({term:item.term,detail:item.meaning,translation:item.translation,ruDetail:item.ruMeaning,type:'Определение',kind:'definition'}))
  ];
  $('#workArea').innerHTML = `<input class="searchbar" id="search" placeholder="Поиск по английскому или русскому тексту…"><div class="filters"><button class="filter active" data-filter="all">Всё · ${TOTAL}</button><button class="filter" data-filter="word">Слова · ${words.length}</button><button class="filter" data-filter="definition">Определения · ${defs.length}</button></div><div class="glossary-wrap" id="rows"></div>`;
  let filter = 'all';
  function draw() {
    const query = normalizeAnswer($('#search').value);
    const list = rows.filter(row => (filter==='all'||row.kind===filter) && normalizeAnswer(`${row.term} ${row.expansion||''} ${row.detail} ${row.translation||''} ${row.ruDetail||''}`).includes(query));
    $('#rows').innerHTML = list.length ? list.map(row => `<div class="glossary-row"><div><span class="tag">${row.type.toUpperCase()}</span><br><strong>${escapeHtml(row.term)}</strong>${row.expansion?`<div class="glossary-expansion">${escapeHtml(row.expansion)}</div>`:''}${row.translation?`<div class="glossary-translation">${escapeHtml(row.translation)}</div>`:''}</div><div class="glossary-descriptions"><p>${escapeHtml(row.detail)}</p>${row.ruDetail?`<p class="glossary-ru-detail">${escapeHtml(row.ruDetail)}</p>`:''}</div></div>`).join('') : '<div class="empty">Ничего не найдено. Попробуй другой запрос.</div>';
  }
  $('#search').oninput = draw;
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active',x===button)); draw();
  });
  draw();
}
init();

const disclaimerClose = document.querySelector('#closeDisclaimer');
if (disclaimerClose) disclaimerClose.addEventListener('click', () => { document.querySelector('#disclaimerOverlay').hidden = true; });
