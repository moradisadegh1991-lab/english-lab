/* English Lab — session engine v2
   Local-first: profile, progress, history, and resume-derived skills all live in localStorage.
   Content is served from Vercel; audio = Web Speech API (TTS + SR). */

const TOTAL_WEEKS = WEEKS.length;
const DAYS_PER_WEEK = 7;
const SESSION_MIN = 30;
const KEY = "englab_v2";

const FA_NUM = s => String(s).replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);

/* ---------------- state ---------------- */
let S = load();
function load(){
  try{
    const j = JSON.parse(localStorage.getItem(KEY));
    if(j) return j;
    const old = JSON.parse(localStorage.getItem("englab_v1"));   // migrate v1
    if(old) return {...fresh(), ...old};
  }catch(e){}
  return fresh();
}
function fresh(){
  return { w:0, d:0, sessions:{}, streak:0, lastDay:null, history:[],
           profile:{name:"", goal:"", level:"intermediate", skills:[], theme:"dark"} };
}
function save(){ localStorage.setItem(KEY, JSON.stringify(S)); }
const skey = slot => `w${S.w}d${S.d}${slot}`;
const doneToday = slot => S.sessions[skey(slot)] !== undefined;
const totalDone = () => Object.keys(S.sessions).length;

/* ---------------- theme ---------------- */
function applyTheme(){ document.documentElement.dataset.theme = S.profile.theme==="light"?"light":""; }
applyTheme();

/* ---------------- speech ---------------- */
let VOICE = null;
function pickVoice(){
  const vs = speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
  VOICE = vs.find(v=>/en-US/i.test(v.lang) && /google|natural|online/i.test(v.name)) ||
          vs.find(v=>/en-US/i.test(v.lang)) || vs[0] || null;
}
if("speechSynthesis" in window){ pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, rate=0.95){
  return new Promise(res=>{
    if(!("speechSynthesis" in window)) return res();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang="en-US"; if(VOICE) u.voice=VOICE;
    u.rate=rate; u.onend=res; u.onerror=res;
    speechSynthesis.speak(u);
  });
}
const SR_CLS = window.SpeechRecognition || window.webkitSpeechRecognition;
let activeSR = null;
function listen(){
  return new Promise(res=>{
    if(!SR_CLS) return res(null);
    const r = new SR_CLS();
    r.lang="en-US"; r.interimResults=false; r.maxAlternatives=1;
    let got=false;
    r.onresult=e=>{got=true;res(e.results[0][0].transcript);};
    r.onerror=()=>{if(!got)res("");};
    r.onend=()=>{if(!got)res("");};
    r.start(); activeSR=r;
  });
}
function norm(t){ return t.toLowerCase().replace(/[^a-z0-9' ]/g," ").split(/\s+/).filter(Boolean); }
function similarity(target, heard){
  const T=norm(target), H=new Set(norm(heard));
  if(!T.length) return 0;
  return Math.round(100*T.filter(w=>H.has(w)).length/T.length);
}

/* ---------------- gauges & helpers ---------------- */
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
function shuffle(a){ a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
const $ = q => document.querySelector(q);
function show(id){ ["home","session","result","profile"].forEach(s=>
  $("#screen-"+s).classList.toggle("hidden", s!==id)); window.scrollTo(0,0); }

/* ---------------- personal phrases from resume skills ---------------- */
function personalPhrases(){
  const sk = S.profile.skills||[];
  if(!sk.length) return [];
  const rot = S.d % sk.length;
  return sk.slice(0,4).map((s,i)=>{
    const t = SKILL_TPL[(i+rot)%SKILL_TPL.length];
    return [t[0].replace("{s}", s), t[1].replace("{s}", s)];
  });
}

/* ---------------- home ---------------- */
function socialToday(){
  const day = Math.floor(Date.now()/864e5);
  return SOCIAL[day % SOCIAL.length];
}
function renderHome(){
  const done = totalDone(), total = TOTAL_WEEKS*DAYS_PER_WEEK*2;
  const pct = done/total;
  const hello = S.profile.name ? `سلام ${S.profile.name}! ` : "";
  $("#main-gauge").innerHTML = ringSVG(220,10,pct) +
    `<div class="center"><div class="big">${Math.round(pct*100)}%</div>
     <div class="sub">${FA_NUM(done)} از ${FA_NUM(total)} جلسه</div></div>`;
  $("#course-note").textContent = hello + "دوره ۶ ماهه • هر روز دو جلسه ۳۰ دقیقه‌ای";
  $("#wk-num").textContent = FA_NUM(S.w+1);
  $("#day-num").textContent = FA_NUM(S.d+1);
  const wk = WEEKS[S.w];
  $("#wk-en").textContent = "WEEK "+String(S.w+1).padStart(2,"0");
  $("#wk-title").textContent = "موضوع این هفته: " + wk.t;
  $("#wk-desc").textContent = wk.en + " — " + FA_NUM(wk.v.length) + " واژه، " +
    FA_NUM(wk.p.length) + " عبارت کاربردی و یک دیالوگ واقعی محیط کار";
  $("#streak").textContent = FA_NUM(S.streak);

  const so = socialToday();
  $("#social-q").textContent = so[0];
  $("#social-a").textContent = so[1];
  $("#social-fa").textContent = so[2];
  $("#social-play").onclick = async ()=>{ await speak(so[0]); await speak(so[1]); };

  const n=doneToday("noon"), g=doneToday("night");
  setSlot("noon",n); setSlot("night",g);
  const btn=$("#btn-start");
  if(n&&g){ btn.disabled=true; btn.textContent="جلسات امروز کامل شد ✓";
    $("#next-hint").textContent="فردا ساعت ۱۳:۰۰ ادامه می‌دهیم."; }
  else{ btn.disabled=false;
    btn.textContent = n?"شروع جلسه گفتاری (۲۱:۰۰)":"شروع جلسه شنیداری (۱۳:۰۰)";
    $("#next-hint").textContent="آلارم‌های ۱۳:۰۰ و ۲۱:۰۰ روی گوشی شما تنظیم شده‌اند."; }

  let list=`<h3>نقشه راه ۲۴ هفته</h3>`;
  WEEKS.forEach((w,i)=>{
    const c=Object.keys(S.sessions).filter(k=>k.startsWith("w"+i+"d")).length;
    const st=i<S.w?"finished":(i===S.w?"now":"");
    list+=`<div class="week-item ${st}">
      <span>${FA_NUM(i+1)}. ${w.t}<br><span class="en">${w.en}</span></span>
      <span class="st">${c}/14</span></div>`;
  });
  $("#week-list").innerHTML=list;
}
function setSlot(slot,done){
  const el=$("#slot-"+slot);
  el.classList.toggle("done",done);
  $("#state-"+slot).textContent = done?
    "انجام شد — نمره "+FA_NUM(S.sessions[skey(slot)])+"٪":"در انتظار";
}

/* ---------------- profile screen ---------------- */
function renderProfile(){
  $("#pf-name").value=S.profile.name||"";
  $("#pf-goal").value=S.profile.goal||"";
  $("#pf-level").value=S.profile.level||"intermediate";
  renderSkills(); renderStats();
}
function renderSkills(){
  const sk=S.profile.skills||[];
  $("#pf-skills").innerHTML = sk.length
    ? sk.map(s=>`<span class="chip">${s}</span>`).join("")
    : "";
  if(sk.length) $("#pf-resume-msg").textContent =
    `${FA_NUM(sk.length)} مهارت شناسایی شد — جمله‌های شخصی از این‌ها ساخته می‌شوند و در گام سایه‌گویی می‌آیند.`;
}
function renderStats(){
  const H=S.history||[];
  $("#st-sessions").textContent=FA_NUM(H.length);
  $("#st-streak2").textContent=FA_NUM(S.streak);
  const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;
  const q=avg(H.map(h=>h.quiz));
  const sp=avg(H.filter(h=>h.speak!=null).map(h=>h.speak));
  $("#st-quiz").textContent = q!=null?FA_NUM(q)+"٪":"—";
  $("#st-speak").textContent = sp!=null?FA_NUM(sp)+"٪":"—";
  $("#st-listen").textContent = FA_NUM(H.filter(h=>h.slot==="noon").length);
  $("#st-talk").textContent   = FA_NUM(H.filter(h=>h.slot==="night").length);
  // quiz trend chart (last 30 sessions)
  const pts=H.slice(-30).map(h=>h.quiz);
  const box=$("#chart-quiz");
  if(pts.length<2){ box.textContent="بعد از چند جلسه، روند نمرات اینجا رسم می‌شود."; return; }
  const W=320,Hh=140,pad=10;
  const x=i=>pad+(W-2*pad)*i/(pts.length-1);
  const y=v=>Hh-pad-(Hh-2*pad)*v/100;
  const line=pts.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
  box.innerHTML=`<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none">
    <line x1="${pad}" y1="${y(75)}" x2="${W-pad}" y2="${y(75)}" stroke="var(--line)" stroke-dasharray="4 4"/>
    <polyline points="${line}" fill="none" stroke="var(--amber)" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${v>=75?"var(--cyan)":"var(--red)"}"/>`).join("")}
  </svg>`;
}
/* profile field persistence */
["pf-name","pf-goal","pf-level"].forEach(id=>{
  document.addEventListener("input",e=>{
    if(e.target.id!==id) return;
    S.profile[{ "pf-name":"name","pf-goal":"goal","pf-level":"level" }[id]] = e.target.value.trim();
    save();
  });
});
/* resume PDF → skills */
document.addEventListener("change", async e=>{
  if(e.target.id!=="pf-resume") return;
  const f=e.target.files[0]; if(!f) return;
  const msg=$("#pf-resume-msg");
  if(!window.pdfjsLib){ msg.textContent="کتابخانه PDF هنوز بارگذاری نشده — چند ثانیه بعد دوباره تلاش کن."; return; }
  msg.textContent="در حال خواندن رزومه…";
  try{
    pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const buf=await f.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf}).promise;
    let text="";
    for(let p=1;p<=Math.min(pdf.numPages,5);p++){
      const pg=await pdf.getPage(p);
      const tc=await pg.getTextContent();
      text+=" "+tc.items.map(it=>it.str).join(" ");
    }
    const low=text.toLowerCase();
    const found=SKILL_BANK.filter(s=>low.includes(s));
    if(!found.length){ msg.textContent="مهارت شناخته‌شده‌ای پیدا نشد — رزومه انگلیسی بهترین نتیجه را می‌دهد."; return; }
    S.profile.skills=found.slice(0,10); save();
    renderSkills();
  }catch(err){ msg.textContent="خواندن PDF ناموفق بود. فایل دیگری امتحان کن."; }
});

/* ---------------- session engine ---------------- */
let SES=null, timerInt=null;

function startSession(slot){
  const wk=WEEKS[S.w];
  const rot=(arr,n)=>arr.map((_,i)=>arr[(i+n)%arr.length]);
  const vocab=rot(wk.v,S.d);
  let phrases=rot(wk.p,S.d);
  const personal=personalPhrases();
  if(slot==="night" && personal.length) phrases=[...phrases.slice(0,4),...personal.slice(0,2)];
  const steps = slot==="noon"
    ? [ {t:"☕ معاشرت روزانه", f:stepSocial},
        {t:"واژگان", f:stepVocab},
        {t:"شنیداری — دیالوگ کامل", f:()=>stepListen(false)},
        {t:"شنیداری — خط به خط", f:()=>stepListen(true)},
        {t:"جمله‌سازی — بشنو و بچین", f:stepBuilder},
        {t:"آزمون پایان جلسه", f:stepQuiz} ]
    : [ {t:"☕ معاشرت روزانه", f:stepSocial},
        {t:"واژگان", f:stepVocab},
        {t:"گفتاری — سایه‌گویی عبارات", f:stepShadow},
        {t:"گفتاری — ایفای نقش در دیالوگ", f:stepRoleplay},
        {t:"آزمون پایان جلسه", f:stepQuiz} ];
  SES={slot,wk,vocab,phrases,step:-1,steps,quiz:null,startedAt:Date.now(),speakScores:[]};
  show("session"); startTimer(); nextStep();
}
function startTimer(){
  clearInterval(timerInt);
  const end=Date.now()+SESSION_MIN*60*1000;
  const tick=()=>{
    const left=Math.max(0,end-Date.now());
    const m=Math.floor(left/60000), s=Math.floor(left%60000/1000);
    const pct=left/(SESSION_MIN*60*1000);
    $("#timer-gauge").innerHTML=ringSVG(64,5,pct,pct<0.15?"warn":"")+
      `<div class="t">${m}:${String(s).padStart(2,"0")}</div>`;
    if(left<=0) clearInterval(timerInt);
  };
  tick(); timerInt=setInterval(tick,1000);
}
function nextStep(){
  speechSynthesis.cancel(); if(activeSR){try{activeSR.abort();}catch(e){}}
  SES.step++;
  if(SES.step>=SES.steps.length) return;
  const st=SES.steps[SES.step];
  $("#step-title").innerHTML=`گام ${FA_NUM(SES.step+1)} از ${FA_NUM(SES.steps.length)}<b>${st.t}</b>`;
  $("#dots").innerHTML=SES.steps.map((_,i)=>
    `<i class="${i<SES.step?"done":i===SES.step?"on":""}"></i>`).join("");
  $("#btn-next").classList.remove("hidden");
  st.f();
}

/* ---- social warm-up: 3 rotating exchanges ---- */
function stepSocial(){
  const day=Math.floor(Date.now()/864e5);
  const picks=[0,7,14].map(off=>SOCIAL[(day+off)%SOCIAL.length]);
  let i=0;
  const render=()=>{
    const s=picks[i];
    $("#stage").innerHTML=`
      <div class="card">
        <div class="counter" style="text-align:center">${i+1} / ${picks.length}</div>
        <div class="en-line">A: ${s[0]}</div>
        <div class="en-line">B: ${s[1]}</div>
        <div class="fa-line">${s[2]}</div>
        <div class="row" style="margin-top:10px">
          <button class="btn ghost small" id="so-play">🔊 پخش</button>
          <button class="btn ghost small" id="so-mic" ${SR_CLS?"":"disabled"}>🎙 جواب بده</button>
          <button class="btn small" id="so-next">${i<picks.length-1?"بعدی":"تمام"}</button>
        </div>
        <div class="sr-box"><div class="heard" id="so-heard"></div>
        <span class="score-pill" id="so-pill" style="visibility:hidden">—</span></div>
      </div>
      <div class="note">سؤال را بشنو، بعد نقش B را خودت با میکروفون جواب بده — یا جواب خودت را بگو!</div>`;
    $("#so-play").onclick=async()=>{await speak(s[0]);await speak(s[1]);};
    $("#so-next").onclick=()=>{ if(i<picks.length-1){i++;render();} else nextStep(); };
    $("#so-mic").onclick=async()=>{
      await speak(s[0]);
      $("#so-heard").textContent="نوبت توست…";
      const heard=await listen();
      $("#so-heard").textContent=heard||"(چیزی شنیده نشد)";
      if(heard){ const sc=similarity(s[1],heard); SES.speakScores.push(sc);
        const p=$("#so-pill"); p.style.visibility="visible"; p.textContent=sc+"%";
        p.className="score-pill "+(sc>=60?"good":sc>=35?"mid":"low"); }
    };
    speak(s[0]);
  };
  $("#btn-next").classList.add("hidden");
  render();
}

/* ---- vocab flashcards ---- */
function stepVocab(){
  let i=0; const V=SES.vocab;
  const render=()=>{
    $("#stage").innerHTML=`
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
    $("#v-say").onclick=()=>speak(V[i][0]);
    $("#v-flip").onclick=()=>$("#v-fa").style.opacity=1;
    $("#v-next").onclick=()=>{ if(i<V.length-1){i++;render();speak(V[i][0]);} else nextStep(); };
    speak(V[i][0]);
  };
  $("#btn-next").classList.add("hidden");
  render();
}

/* ---- listening ---- */
function renderDialogue(revealFA,meB){
  return SES.wk.d.map((l,idx)=>`
    <div class="dlg-line ${meB&&l[0]==="B"?"me":""}" data-i="${idx}">
      <span class="who">${l[0]}</span>
      <div class="bubble">
        <div class="en-t">${l[1]}</div>
        <div class="fa-t" style="${revealFA?"":"display:none"}">${l[2]}</div>
      </div>
    </div>`).join("");
}
async function playAll(slow){
  for(let i=0;i<SES.wk.d.length;i++){
    if(!SES) return;
    document.querySelectorAll(".dlg-line").forEach(e=>e.classList.remove("playing"));
    const el=document.querySelector(`.dlg-line[data-i="${i}"]`);
    if(el){el.classList.add("playing");el.scrollIntoView({block:"center",behavior:"smooth"});}
    await speak(SES.wk.d[i][1], slow?0.72:0.95);
  }
  document.querySelectorAll(".dlg-line").forEach(e=>e.classList.remove("playing"));
}
function stepListen(withFA){
  $("#stage").innerHTML=`
    <div class="note">${withFA
      ?"بار دوم: آهسته‌تر گوش کنید، ترجمه‌ها باز است. روی هر خط بزنید تا دوباره پخش شود."
      :"بار اول: فقط گوش کنید و سعی کنید مفهوم کلی را بگیرید. ترجمه بسته است."}</div>
    <div id="dlg">${renderDialogue(withFA,false)}</div>
    <button class="btn ghost" id="replay">▶ پخش ${withFA?"آهسته":"دیالوگ"}</button>`;
  $("#replay").onclick=()=>playAll(withFA);
  document.querySelectorAll(".dlg-line").forEach(el=>{
    el.onclick=()=>speak(SES.wk.d[+el.dataset.i][1], withFA?0.72:0.95);
  });
  playAll(withFA);
}

/* ---- interactive: hear the sentence, rebuild it from word chips ---- */
function stepBuilder(){
  const lines=shuffle(SES.wk.d.filter(l=>norm(l[1]).length<=9)).slice(0,3);
  if(!lines.length){ nextStep(); return; }
  let i=0;
  const render=()=>{
    const target=lines[i][1];
    const words=target.replace(/[.,!?]/g,"").split(/\s+/);
    let answer=[];
    $("#stage").innerHTML=`
      <div class="card">
        <div class="counter" style="text-align:center">${i+1} / ${lines.length}</div>
        <div class="note" style="text-align:center">جمله را بشنو و کلمه‌ها را به ترتیب بچین</div>
        <div class="chips-answer" id="ans"></div>
        <div class="chips-pool" id="pool"></div>
        <div class="row">
          <button class="btn ghost small" id="b-play">🔊 دوباره بشنو</button>
          <button class="btn ghost small" id="b-reset">↺ از اول</button>
          <button class="btn small" id="b-check">بررسی</button>
        </div>
        <div class="fa-line" id="b-fa" style="text-align:center;margin-top:8px"></div>
      </div>`;
    const pool=$("#pool"), ans=$("#ans");
    const draw=()=>{
      ans.innerHTML=answer.map((w,k)=>`<button class="word-chip" data-a="${k}">${w}</button>`).join("");
      const used={}; answer.forEach(w=>used[w]=(used[w]||0)+1);
      const remaining=[...words];
      answer.forEach(w=>{const ix=remaining.indexOf(w); if(ix>-1) remaining.splice(ix,1);});
      pool.innerHTML=shuffleStable(remaining).map((w,k)=>`<button class="word-chip" data-p="${w}::${k}">${w}</button>`).join("");
      pool.querySelectorAll(".word-chip").forEach(b=>b.onclick=()=>{answer.push(b.textContent);draw();});
      ans.querySelectorAll(".word-chip").forEach(b=>b.onclick=()=>{answer.splice(+b.dataset.a,1);draw();});
    };
    // stable shuffle per sentence so chips don't jump each redraw
    const seed=norm(target).join("").length;
    function shuffleStable(a){ a=[...a]; let s=seed;
      for(let k=a.length-1;k>0;k--){ s=(s*9301+49297)%233280; const j=s%(k+1); [a[k],a[j]]=[a[j],a[k]]; } return a; }
    draw();
    $("#b-play").onclick=()=>speak(target);
    $("#b-reset").onclick=()=>{answer=[];draw();$("#ans").className="chips-answer";};
    $("#b-check").onclick=()=>{
      const ok=answer.join(" ")===words.join(" ");
      $("#ans").className="chips-answer "+(ok?"ok":"bad");
      $("#b-fa").textContent=ok?"✓ درست است! "+lines[i][2]:"ترتیب درست نیست — دوباره گوش بده.";
      if(ok) setTimeout(()=>{ i++; i<lines.length?render():nextStep(); },1200);
    };
    speak(target);
  };
  $("#btn-next").classList.add("hidden");
  render();
}

/* ---- speaking: shadowing (includes personal resume phrases) ---- */
function stepShadow(){
  let i=0; const P=SES.phrases;
  const render=()=>{
    const isPersonal = i>=4 && (S.profile.skills||[]).length && SES.slot==="night";
    $("#stage").innerHTML=`
      <div class="card">
        <div class="counter" style="text-align:center">${i+1} / ${P.length} ${isPersonal?"— ⭐ جمله شخصی از رزومه شما":""}</div>
        <div class="en-line">${P[i][0]}</div>
        <div class="fa-line">${P[i][1]}</div>
        <div class="sr-box">
          <button class="mic-btn" id="mic">🎙</button>
          <div class="heard" id="heard">${SR_CLS?"دکمه میکروفون را بزنید و جمله را بگویید":"تشخیص گفتار در این مرورگر نیست — جمله را بلند بخوانید"}</div>
          <span class="score-pill" id="pill" style="visibility:hidden">—</span>
        </div>
        <div class="row">
          <button class="btn ghost small" id="p-say">🔊 گوش دادن</button>
          <button class="btn small" id="p-next">${i<P.length-1?"عبارت بعدی":"تمام"}</button>
        </div>
      </div>`;
    $("#p-say").onclick=()=>speak(P[i][0]);
    $("#p-next").onclick=()=>{ if(i<P.length-1){i++;render();} else nextStep(); };
    $("#mic").onclick=async()=>{
      if(!SR_CLS){ speak(P[i][0]); return; }
      const mic=$("#mic"); mic.classList.add("rec"); $("#heard").textContent="در حال شنیدن…";
      const heard=await listen(); mic.classList.remove("rec");
      if(heard===null) return;
      $("#heard").textContent=heard||"(چیزی شنیده نشد — دوباره تلاش کنید)";
      if(heard){ const sc=similarity(P[i][0],heard); SES.speakScores.push(sc);
        const pill=$("#pill"); pill.style.visibility="visible"; pill.textContent=sc+"%";
        pill.className="score-pill "+(sc>=75?"good":sc>=45?"mid":"low"); }
    };
    speak(P[i][0]);
  };
  $("#btn-next").classList.add("hidden");
  render();
}

/* ---- speaking: role-play ---- */
function stepRoleplay(){
  $("#stage").innerHTML=`
    <div class="note">شما نقش <b class="en">B</b> را دارید. خط‌های طرف مقابل پخش می‌شود؛
    نوبت شما که رسید، خط زردرنگ را با میکروفون بگویید.</div>
    <div id="dlg">${renderDialogue(true,true)}</div>
    <button class="btn" id="rp-start">▶ شروع ایفای نقش</button>`;
  $("#rp-start").onclick=runRoleplay;
  $("#btn-next").classList.add("hidden");
}
async function runRoleplay(){
  $("#rp-start").disabled=true;
  for(let i=0;i<SES.wk.d.length;i++){
    if(!SES) return;
    const line=SES.wk.d[i];
    const el=document.querySelector(`.dlg-line[data-i="${i}"]`);
    document.querySelectorAll(".dlg-line").forEach(e=>e.classList.remove("playing"));
    if(el){el.classList.add("playing");el.scrollIntoView({block:"center",behavior:"smooth"});}
    if(line[0]==="A"){ await speak(line[1]); }
    else{
      if(SR_CLS){
        const heard=await listen();
        const sc=heard?similarity(line[1],heard):0;
        SES.speakScores.push(sc);
        if(el){ const pill=document.createElement("span");
          pill.className="score-pill "+(sc>=75?"good":sc>=45?"mid":"low");
          pill.textContent=sc+"%"; el.querySelector(".bubble").appendChild(pill); }
      } else { await speak(line[1],0.85); }
    }
  }
  $("#btn-next").classList.remove("hidden");
  $("#rp-start").textContent="↺ تکرار ایفای نقش"; $("#rp-start").disabled=false;
}

/* ---------------- quiz ---------------- */
function buildQuiz(){
  const wk=SES.wk, qs=[];
  shuffle(wk.v).slice(0,4).forEach(v=>{
    const wrong=shuffle(wk.v.filter(x=>x!==v)).slice(0,3).map(x=>x[1]);
    qs.push({q:`معنی این واژه چیست؟`, en:v[0], opts:shuffle([v[1],...wrong]), a:v[1], faOpts:true});
  });
  shuffle(wk.p).slice(0,2).forEach(p=>{
    const wrong=shuffle(wk.p.filter(x=>x!==p)).slice(0,3).map(x=>x[0]);
    qs.push({q:`کدام جمله انگلیسی یعنی: «${p[1]}»`, en:"", opts:shuffle([p[0],...wrong]), a:p[0], faOpts:false});
  });
  // audio question: hear a sentence, pick its meaning
  shuffle(wk.p).slice(0,2).forEach(p=>{
    const wrong=shuffle(wk.p.filter(x=>x!==p)).slice(0,3).map(x=>x[1]);
    qs.push({q:`🔊 جمله را بشنو — معنی‌اش چیست؟`, en:p[0], hideEn:true, opts:shuffle([p[1],...wrong]), a:p[1], faOpts:true});
  });
  return shuffle(qs);
}
function stepQuiz(){
  SES.quiz={list:buildQuiz(),i:0,correct:0};
  $("#btn-next").classList.add("hidden");
  renderQ();
}
function renderQ(){
  const Q=SES.quiz, item=Q.list[Q.i];
  $("#stage").innerHTML=`
    <div class="card">
      <div class="counter" style="text-align:center">سؤال ${FA_NUM(Q.i+1)} از ${FA_NUM(Q.list.length)}</div>
      <div class="q-question">${item.q}${item.en&&!item.hideEn?`<span class="en">${item.en}</span>`:""}
        ${item.hideEn?`<button class="btn ghost small" id="q-replay" style="margin-top:8px">🔊 پخش دوباره</button>`:""}
      </div>
      <div class="opts">${item.opts.map((o,k)=>
        `<button class="opt ${item.faOpts?"":"en"}" data-k="${k}">${o}</button>`).join("")}</div>
    </div>`;
  if(item.en) speak(item.en);
  const rq=$("#q-replay"); if(rq) rq.onclick=()=>speak(item.en);
  document.querySelectorAll(".opt").forEach(b=>{
    b.onclick=()=>{
      const chosen=item.opts[+b.dataset.k], ok=chosen===item.a;
      if(ok){Q.correct++;b.classList.add("correct");}
      else{ b.classList.add("wrong");
        document.querySelectorAll(".opt").forEach(x=>{if(x.textContent===item.a)x.classList.add("correct");}); }
      document.querySelectorAll(".opt").forEach(x=>x.onclick=null);
      setTimeout(()=>{ Q.i++; Q.i<Q.list.length?renderQ():finishSession(); },900);
    };
  });
}

/* ---------------- finish ---------------- */
function finishSession(){
  clearInterval(timerInt); speechSynthesis.cancel();
  const Q=SES.quiz;
  const quizPct=Math.round(100*Q.correct/Q.list.length);
  const spk=SES.speakScores.length
    ? Math.round(SES.speakScores.reduce((a,b)=>a+b,0)/SES.speakScores.length):null;

  S.sessions[skey(SES.slot)]=quizPct;
  S.history=S.history||[];
  S.history.push({t:Date.now(), slot:SES.slot, quiz:quizPct, speak:spk});
  if(S.history.length>200) S.history=S.history.slice(-200);

  const today=new Date().toDateString();
  if(S.lastDay!==today){
    const y=new Date(Date.now()-864e5).toDateString();
    S.streak=(S.lastDay===y)?S.streak+1:1;
    S.lastDay=today;
  }
  if(doneToday("noon")&&doneToday("night")){
    S.d++; if(S.d>=DAYS_PER_WEEK){S.d=0;S.w=Math.min(S.w+1,TOTAL_WEEKS-1);}
  }
  save();

  $("#res-pct").textContent=quizPct+"%";
  $("#res-msg").textContent = quizPct>=75?"عالی! این جلسه را قبول شدید."
    :quizPct>=50?"خوب بود — فردا واژه‌های همین هفته دوباره مرور می‌شوند."
    :"اشکالی ندارد؛ محتوای هفته تکرار می‌شود تا جا بیفتد.";
  $("#res-detail").innerHTML=`
    <h3>کارنامه جلسه</h3>
    <div class="fa-line">آزمون: ${FA_NUM(Q.correct)} پاسخ درست از ${FA_NUM(Q.list.length)}</div>
    ${spk!==null?`<div class="fa-line">میانگین دقت گفتار: ${FA_NUM(spk)}٪</div>`:""}
    <div class="fa-line">زمان جلسه: ${FA_NUM(Math.round((Date.now()-SES.startedAt)/60000))} دقیقه</div>
    <div class="fa-line">تحلیل کامل روند در صفحه پروفایل 👤</div>`;
  SES=null;
  show("result");
}

/* ---------------- wiring ---------------- */
$("#btn-start").onclick=()=>startSession(doneToday("noon")?"night":"noon");
$("#slot-noon").onclick=()=>{if(!doneToday("noon"))startSession("noon");};
$("#slot-night").onclick=()=>{if(!doneToday("night"))startSession("night");};
$("#btn-next").onclick=nextStep;
$("#btn-exit").onclick=()=>{if(confirm("جلسه ذخیره نمی‌شود. خارج می‌شوید؟")){
  clearInterval(timerInt);speechSynthesis.cancel();SES=null;renderHome();show("home");}};
$("#btn-home").onclick=()=>{renderHome();show("home");};
$("#btn-profile").onclick=()=>{renderProfile();show("profile");};
$("#btn-profile-back").onclick=()=>{renderHome();show("home");};
$("#btn-theme").onclick=()=>{
  S.profile.theme = S.profile.theme==="light"?"dark":"light";
  save(); applyTheme();
};

renderHome();
