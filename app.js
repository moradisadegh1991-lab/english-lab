/* English Lab — session engine
   Progress lives ONLY in localStorage (local-first, per user requirement).
   Lessons/content are served from Vercel; audio = Web Speech API (TTS + SR). */

const TOTAL_WEEKS = WEEKS.length;          // 24
const DAYS_PER_WEEK = 7;
const SESSION_MIN = 30;
const KEY = "englab_v1";

const FA_NUM = s => String(s).replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);

/* ---------------- state ---------------- */
let S = load();
function load(){
  try{ const j = JSON.parse(localStorage.getItem(KEY)); if(j) return j; }catch(e){}
  return { w:0, d:0, sessions:{}, streak:0, lastDay:null };
}
function save(){ localStorage.setItem(KEY, JSON.stringify(S)); }
const skey = (slot) => `w${S.w}d${S.d}${slot}`;
const doneToday = slot => S.sessions[skey(slot)] !== undefined;
const totalDone = () => Object.keys(S.sessions).length;

/* ---------------- speech ---------------- */
let VOICE = null;
function pickVoice(){
  const vs = speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
  VOICE = vs.find(v=>/en-US/i.test(v.lang) && /google|natural|online/i.test(v.name)) ||
          vs.find(v=>/en-US/i.test(v.lang)) || vs[0] || null;
}
if("speechSynthesis" in window){
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speak(text, rate=0.95){
  return new Promise(res=>{
    if(!("speechSynthesis" in window)) return res();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; if(VOICE) u.voice = VOICE;
    u.rate = rate; u.onend = res; u.onerror = res;
    speechSynthesis.speak(u);
  });
}
const SR_CLS = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(){
  return new Promise((res)=>{
    if(!SR_CLS) return res(null);                 // unsupported → fallback handled by caller
    const r = new SR_CLS();
    r.lang="en-US"; r.interimResults=false; r.maxAlternatives=1;
    let got=false;
    r.onresult = e => { got=true; res(e.results[0][0].transcript); };
    r.onerror  = () => { if(!got) res(""); };
    r.onend    = () => { if(!got) res(""); };
    r.start();
    activeSR = r;
  });
}
let activeSR = null;
function norm(t){ return t.toLowerCase().replace(/[^a-z0-9' ]/g," ").split(/\s+/).filter(Boolean); }
function similarity(target, heard){
  const T = norm(target), H = new Set(norm(heard));
  if(!T.length) return 0;
  const hit = T.filter(w=>H.has(w)).length;
  return Math.round(100*hit/T.length);
}

/* ---------------- gauges ---------------- */
function ringSVG(size, stroke, pct, cls){
  const r=(size-stroke)/2, c=2*Math.PI*r, off=c*(1-pct);
  let ticks="";
  if(size>100){ for(let i=0;i<12;i++){ const a=i*30*Math.PI/180;
    const x1=size/2+(r-8)*Math.cos(a), y1=size/2+(r-8)*Math.sin(a);
    const x2=size/2+(r-3)*Math.cos(a), y2=size/2+(r-3)*Math.sin(a);
    ticks+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="1.5"/>`; } }
  return `<svg width="${size}" height="${size}">
    <g class="ticks">${ticks}</g>
    <circle class="track" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="fill ${cls||""}" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${stroke}"
      stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
  </svg>`;
}

/* ---------------- home ---------------- */
const $ = q => document.querySelector(q);
function show(id){ ["home","session","result"].forEach(s=>
  $("#screen-"+s).classList.toggle("hidden", s!==id)); window.scrollTo(0,0); }

function renderHome(){
  const done = totalDone(), total = TOTAL_WEEKS*DAYS_PER_WEEK*2;
  const pct = done/total;
  $("#main-gauge").innerHTML = ringSVG(220,10,pct) +
    `<div class="center"><div class="big">${Math.round(pct*100)}%</div>
     <div class="sub">${FA_NUM(done)} از ${FA_NUM(total)} جلسه</div></div>`;
  $("#course-note").textContent = "دوره ۶ ماهه • هر روز دو جلسه ۳۰ دقیقه‌ای";
  $("#wk-num").textContent = FA_NUM(S.w+1);
  $("#day-num").textContent = FA_NUM(S.d+1);
  const wk = WEEKS[S.w];
  $("#wk-en").textContent = "WEEK "+String(S.w+1).padStart(2,"0");
  $("#wk-title").textContent = "موضوع این هفته: " + wk.t;
  $("#wk-desc").textContent = wk.en + " — " + FA_NUM(wk.v.length) + " واژه، " +
    FA_NUM(wk.p.length) + " عبارت کاربردی و یک دیالوگ واقعی محیط کار";
  $("#streak").textContent = FA_NUM(S.streak);

  const n = doneToday("noon"), g = doneToday("night");
  setSlot("noon", n); setSlot("night", g);
  const btn = $("#btn-start");
  if(n && g){ btn.disabled = true; btn.textContent = "جلسات امروز کامل شد ✓";
    $("#next-hint").textContent = "فردا ساعت ۱۳:۰۰ ادامه می‌دهیم."; }
  else { btn.disabled = false;
    btn.textContent = n ? "شروع جلسه گفتاری (۲۱:۰۰)" : "شروع جلسه شنیداری (۱۳:۰۰)";
    $("#next-hint").textContent = "آلارم‌های ۱۳:۰۰ و ۲۱:۰۰ روی گوشی شما تنظیم شده‌اند."; }

  let list = `<h3>نقشه راه ۲۴ هفته</h3>`;
  WEEKS.forEach((w,i)=>{
    const c = countWeek(i), st = i<S.w?"finished":(i===S.w?"now":"");
    list += `<div class="week-item ${st}">
      <span>${FA_NUM(i+1)}. ${w.t}<br><span class="en">${w.en}</span></span>
      <span class="st">${c}/14</span></div>`;
  });
  $("#week-list").innerHTML = list;
}
function countWeek(w){
  return Object.keys(S.sessions).filter(k=>k.startsWith("w"+w+"d")).length;
}
function setSlot(slot, done){
  const el = $("#slot-"+slot);
  el.classList.toggle("done", done);
  $("#state-"+slot).textContent = done ?
    "انجام شد — نمره " + FA_NUM(S.sessions[skey(slot)]) + "٪" : "در انتظار";
}

/* ---------------- session engine ---------------- */
let SES = null, timerInt = null;

function startSession(slot){
  const wk = WEEKS[S.w];
  // rotate content by day so the week feels fresh (spaced repetition)
  const rot = (arr,n)=>arr.map((_,i)=>arr[(i+n)%arr.length]);
  const vocab = rot(wk.v, S.d), phrases = rot(wk.p, S.d);
  const steps = slot==="noon"
    ? [ {t:"واژگان", f:stepVocab},
        {t:"شنیداری — دیالوگ کامل", f:()=>stepListen(false)},
        {t:"شنیداری — خط به خط", f:()=>stepListen(true)},
        {t:"آزمون پایان جلسه", f:stepQuiz} ]
    : [ {t:"واژگان", f:stepVocab},
        {t:"گفتاری — سایه‌گویی عبارات", f:stepShadow},
        {t:"گفتاری — ایفای نقش در دیالوگ", f:stepRoleplay},
        {t:"آزمون پایان جلسه", f:stepQuiz} ];
  SES = { slot, wk, vocab, phrases, step:-1, steps, quiz:null,
          startedAt:Date.now(), speakScores:[] };
  show("session");
  startTimer();
  nextStep();
}
function startTimer(){
  clearInterval(timerInt);
  const end = Date.now() + SESSION_MIN*60*1000;
  const tick = ()=>{
    const left = Math.max(0, end-Date.now());
    const m = Math.floor(left/60000), s = Math.floor(left%60000/1000);
    const pct = left/(SESSION_MIN*60*1000);
    $("#timer-gauge").innerHTML = ringSVG(64,5,pct, pct<0.15?"warn":"") +
      `<div class="t">${m}:${String(s).padStart(2,"0")}</div>`;
    if(left<=0) clearInterval(timerInt);
  };
  tick(); timerInt = setInterval(tick,1000);
}
function nextStep(){
  speechSynthesis.cancel(); if(activeSR){try{activeSR.abort();}catch(e){}}
  SES.step++;
  if(SES.step >= SES.steps.length) return; // quiz ends the session itself
  const st = SES.steps[SES.step];
  $("#step-title").innerHTML = `گام ${FA_NUM(SES.step+1)} از ${FA_NUM(SES.steps.length)}<b>${st.t}</b>`;
  $("#dots").innerHTML = SES.steps.map((_,i)=>
    `<i class="${i<SES.step?"done":i===SES.step?"on":""}"></i>`).join("");
  $("#btn-next").classList.remove("hidden");
  st.f();
}

/* ---- step 1: vocab flashcards ---- */
function stepVocab(){
  let i = 0; const V = SES.vocab;
  const render = ()=>{
    $("#stage").innerHTML = `
      <div class="card vocab-card">
        <div class="counter">${i+1} / ${V.length}</div>
        <div class="en">${V[i][0]}</div>
        <div class="fa" id="v-fa" style="opacity:0">${V[i][1]}</div>
        <div class="row" style="width:100%">
          <button class="btn ghost small" id="v-say">🔊 تلفظ</button>
          <button class="btn ghost small" id="v-flip">معنی</button>
          <button class="btn small" id="v-next">${i<V.length-1?"بعدی":"تمام"}</button>
        </div>
      </div>
      <div class="note">هر واژه را بشنوید، بلند تکرار کنید، بعد معنی را ببینید.</div>`;
    $("#v-say").onclick = ()=>speak(V[i][0]);
    $("#v-flip").onclick = ()=>$("#v-fa").style.opacity=1;
    $("#v-next").onclick = ()=>{ if(i<V.length-1){i++;render();speak(V[i][0]);} else nextStep(); };
    speak(V[i][0]);
  };
  $("#btn-next").classList.add("hidden");
  render();
}

/* ---- step 2/3: listening ---- */
function renderDialogue(revealFA, meB){
  return SES.wk.d.map((l,idx)=>`
    <div class="dlg-line ${meB && l[0]==="B" ? "me":""}" data-i="${idx}">
      <span class="who">${l[0]}</span>
      <div class="bubble">
        <div class="en-t">${l[1]}</div>
        <div class="fa-t" style="${revealFA?"":"display:none"}">${l[2]}</div>
      </div>
    </div>`).join("");
}
async function playAll(slow){
  for(let i=0;i<SES.wk.d.length;i++){
    if(!SES || SES.abort) return;
    document.querySelectorAll(".dlg-line").forEach(e=>e.classList.remove("playing"));
    const el = document.querySelector(`.dlg-line[data-i="${i}"]`);
    if(el){ el.classList.add("playing"); el.scrollIntoView({block:"center",behavior:"smooth"}); }
    await speak(SES.wk.d[i][1], slow?0.72:0.95);
  }
  document.querySelectorAll(".dlg-line").forEach(e=>e.classList.remove("playing"));
}
function stepListen(withFA){
  $("#stage").innerHTML = `
    <div class="note">${withFA
      ? "بار دوم: آهسته‌تر گوش کنید، ترجمه‌ها باز است. روی هر خط بزنید تا دوباره پخش شود."
      : "بار اول: فقط گوش کنید و سعی کنید مفهوم کلی را بگیرید. ترجمه بسته است."}</div>
    <div id="dlg">${renderDialogue(withFA,false)}</div>
    <button class="btn ghost" id="replay">▶ پخش ${withFA?"آهسته":"دیالوگ"}</button>`;
  $("#replay").onclick = ()=>playAll(withFA);
  document.querySelectorAll(".dlg-line").forEach(el=>{
    el.onclick = ()=>speak(SES.wk.d[+el.dataset.i][1], withFA?0.72:0.95);
  });
  playAll(withFA);
}

/* ---- speaking: shadowing ---- */
function stepShadow(){
  let i=0; const P = SES.phrases;
  const render = ()=>{
    $("#stage").innerHTML = `
      <div class="card">
        <div class="counter" style="text-align:center">${i+1} / ${P.length}</div>
        <div class="en-line">${P[i][0]}</div>
        <div class="fa-line">${P[i][1]}</div>
        <div class="sr-box">
          <button class="mic-btn" id="mic">🎙</button>
          <div class="heard" id="heard">${SR_CLS?"دکمه میکروفون را بزنید و جمله را بگویید":"تشخیص گفتار در این مرورگر نیست — جمله را بلند بخوانید و خودارزیابی کنید"}</div>
          <span class="score-pill" id="pill" style="visibility:hidden">—</span>
        </div>
        <div class="row">
          <button class="btn ghost small" id="p-say">🔊 گوش دادن</button>
          <button class="btn small" id="p-next">${i<P.length-1?"عبارت بعدی":"تمام"}</button>
        </div>
      </div>`;
    $("#p-say").onclick = ()=>speak(P[i][0]);
    $("#p-next").onclick = ()=>{ if(i<P.length-1){i++;render();} else nextStep(); };
    $("#mic").onclick = async ()=>{
      if(!SR_CLS){ speak(P[i][0]); return; }
      const mic=$("#mic"); mic.classList.add("rec"); $("#heard").textContent="در حال شنیدن…";
      const heard = await listen();
      mic.classList.remove("rec");
      if(heard===null) return;
      $("#heard").textContent = heard || "(چیزی شنیده نشد — دوباره تلاش کنید)";
      if(heard){ const sc = similarity(P[i][0], heard); SES.speakScores.push(sc);
        const pill=$("#pill"); pill.style.visibility="visible"; pill.textContent=sc+"%";
        pill.className="score-pill "+(sc>=75?"good":sc>=45?"mid":"low"); }
    };
    speak(P[i][0]);
  };
  $("#btn-next").classList.add("hidden");
  render();
}

/* ---- speaking: role-play (user speaks B lines) ---- */
function stepRoleplay(){
  $("#stage").innerHTML = `
    <div class="note">شما نقش <b class="en">B</b> را دارید. خط‌های طرف مقابل پخش می‌شود؛
    نوبت شما که رسید، خط زردرنگ را با میکروفون بگویید.</div>
    <div id="dlg">${renderDialogue(true,true)}</div>
    <button class="btn" id="rp-start">▶ شروع ایفای نقش</button>`;
  $("#rp-start").onclick = runRoleplay;
  $("#btn-next").classList.add("hidden");
}
async function runRoleplay(){
  $("#rp-start").disabled = true;
  for(let i=0;i<SES.wk.d.length;i++){
    if(!SES) return;
    const line = SES.wk.d[i];
    const el = document.querySelector(`.dlg-line[data-i="${i}"]`);
    document.querySelectorAll(".dlg-line").forEach(e=>e.classList.remove("playing"));
    if(el){ el.classList.add("playing"); el.scrollIntoView({block:"center",behavior:"smooth"}); }
    if(line[0]==="A"){ await speak(line[1]); }
    else {
      if(SR_CLS){
        const heard = await listen();
        const sc = heard ? similarity(line[1], heard) : 0;
        SES.speakScores.push(sc);
        if(el){ const pill = document.createElement("span");
          pill.className="score-pill "+(sc>=75?"good":sc>=45?"mid":"low");
          pill.textContent=sc+"%"; el.querySelector(".bubble").appendChild(pill); }
      } else { await speak(line[1],0.85); } // fallback: model reads, user shadows
    }
  }
  $("#btn-next").classList.remove("hidden");
  $("#rp-start").textContent="↺ تکرار ایفای نقش"; $("#rp-start").disabled=false;
}

/* ---------------- quiz ---------------- */
function shuffle(a){ a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function buildQuiz(){
  const wk=SES.wk, qs=[];
  shuffle(wk.v).slice(0,5).forEach(v=>{
    const wrong = shuffle(wk.v.filter(x=>x!==v)).slice(0,3).map(x=>x[1]);
    qs.push({q:`معنی این واژه چیست؟`, en:v[0], opts:shuffle([v[1],...wrong]), a:v[1], faOpts:true});
  });
  shuffle(wk.p).slice(0,3).forEach(p=>{
    const wrong = shuffle(wk.p.filter(x=>x!==p)).slice(0,3).map(x=>x[0]);
    qs.push({q:`کدام جمله انگلیسی یعنی: «${p[1]}»`, en:"", opts:shuffle([p[0],...wrong]), a:p[0], faOpts:false});
  });
  return shuffle(qs);
}
function stepQuiz(){
  SES.quiz = { list:buildQuiz(), i:0, correct:0 };
  $("#btn-next").classList.add("hidden");
  renderQ();
}
function renderQ(){
  const Q = SES.quiz, item = Q.list[Q.i];
  $("#stage").innerHTML = `
    <div class="card">
      <div class="counter" style="text-align:center">سؤال ${FA_NUM(Q.i+1)} از ${FA_NUM(Q.list.length)}</div>
      <div class="q-question">${item.q}${item.en?`<span class="en">${item.en}</span>`:""}</div>
      <div class="opts">${item.opts.map((o,k)=>
        `<button class="opt ${item.faOpts?"":"en"}" data-k="${k}">${o}</button>`).join("")}</div>
    </div>`;
  if(item.en) speak(item.en);
  document.querySelectorAll(".opt").forEach(b=>{
    b.onclick = ()=>{
      const chosen = item.opts[+b.dataset.k], ok = chosen===item.a;
      if(ok){ Q.correct++; b.classList.add("correct"); }
      else { b.classList.add("wrong");
        document.querySelectorAll(".opt").forEach(x=>{ if(x.textContent===item.a) x.classList.add("correct"); }); }
      document.querySelectorAll(".opt").forEach(x=>x.onclick=null);
      setTimeout(()=>{ Q.i++; Q.i<Q.list.length ? renderQ() : finishSession(); }, 900);
    };
  });
}

/* ---------------- finish ---------------- */
function finishSession(){
  clearInterval(timerInt); speechSynthesis.cancel();
  const Q = SES.quiz;
  const quizPct = Math.round(100*Q.correct/Q.list.length);
  const spk = SES.speakScores.length
    ? Math.round(SES.speakScores.reduce((a,b)=>a+b,0)/SES.speakScores.length) : null;

  S.sessions[skey(SES.slot)] = quizPct;
  // streak
  const today = new Date().toDateString();
  if(S.lastDay !== today){
    const y = new Date(Date.now()-864e5).toDateString();
    S.streak = (S.lastDay===y) ? S.streak+1 : 1;
    S.lastDay = today;
  }
  // advance day when both slots are done
  if(doneToday("noon") && doneToday("night")){
    S.d++; if(S.d>=DAYS_PER_WEEK){ S.d=0; S.w=Math.min(S.w+1, TOTAL_WEEKS-1); }
  }
  save();

  $("#res-pct").textContent = quizPct+"%";
  $("#res-msg").textContent = quizPct>=75 ? "عالی! این جلسه را قبول شدید."
    : quizPct>=50 ? "خوب بود — فردا واژه‌های همین هفته دوباره مرور می‌شوند."
    : "اشکالی ندارد؛ محتوای هفته تکرار می‌شود تا جا بیفتد.";
  $("#res-detail").innerHTML = `
    <h3>کارنامه جلسه</h3>
    <div class="fa-line">آزمون: ${FA_NUM(Q.correct)} پاسخ درست از ${FA_NUM(Q.list.length)}</div>
    ${spk!==null?`<div class="fa-line">میانگین دقت گفتار: ${FA_NUM(spk)}٪</div>`:""}
    <div class="fa-line">زمان جلسه: ${FA_NUM(Math.round((Date.now()-SES.startedAt)/60000))} دقیقه</div>`;
  SES = null;
  show("result");
}

/* ---------------- wiring ---------------- */
$("#btn-start").onclick = ()=> startSession(doneToday("noon") ? "night" : "noon");
$("#slot-noon").onclick = ()=>{ if(!doneToday("noon")) startSession("noon"); };
$("#slot-night").onclick = ()=>{ if(!doneToday("night")) startSession("night"); };
$("#btn-next").onclick = nextStep;
$("#btn-exit").onclick = ()=>{ if(confirm("جلسه ذخیره نمی‌شود. خارج می‌شوید؟")){
  clearInterval(timerInt); speechSynthesis.cancel(); SES=null; renderHome(); show("home"); } };
$("#btn-home").onclick = ()=>{ renderHome(); show("home"); };

renderHome();
