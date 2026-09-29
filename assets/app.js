(function(){
"use strict";
var state = { worryText:"", playing:false, elapsed:0, timerId:null, current:null };

function showView(id){
  document.querySelectorAll(".view").forEach(function(v){v.classList.toggle("on", v.id===id);});
}
document.querySelectorAll(".back").forEach(function(b){b.addEventListener("click",function(){
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
  showView(b.dataset.to);
});});

function updateClock(){
  var d=new Date(), hh=String(d.getHours()).padStart(2,"0"), mm=String(d.getMinutes()).padStart(2,"0");
  document.getElementById("clock").textContent=hh+":"+mm;
  var h=d.getHours();
  document.getElementById("greet").textContent = h<5?"Still up. Rough one?":(h<12?"Morning. Trouble sleeping?":(h<18?"Afternoon check-in":"Good evening, still up?"));
}
updateClock(); setInterval(updateClock,30000);

var worryEl=document.getElementById("worry");
document.querySelectorAll(".chips .chip").forEach(function(c){
  c.addEventListener("click",function(){
    document.querySelectorAll(".chips .chip").forEach(function(x){x.classList.remove("on");});
    c.classList.add("on");
    worryEl.value=c.dataset.t; updateWC();
  });
});
function updateWC(){
  var w=worryEl.value.trim().split(/\s+/).filter(Boolean).length;
  document.getElementById("wc").textContent=w+" word"+(w===1?"":"s")+". That's plenty.";
}
worryEl.addEventListener("input",updateWC);

function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
var FALLBACK_BRIDGES = {
  default:"Whatever it is, it'll still be there tomorrow with a clearer head to look at it. For tonight, let's put it down."
};
var FALLBACK_EPS = [
  {title:"The Slow Decline of the Roman Grain Trade", tag:"Fall Asleep History", source:"Spotify", minutes:38},
  {title:"Why Brains Catastrophize at Night", tag:"The Overthinking Fix", source:"YouTube", minutes:22},
  {title:"A History of Filing Cabinets", tag:"Boring Things Explained", source:"SoundCloud", minutes:31}
];

async function callApi(payload){
  var res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if(!res.ok){ var err = new Error("API error " + res.status); err.status = res.status; throw err; }
  return res.json();
}

async function curate(){
  var text = worryEl.value.trim();
  if(!text) { worryEl.focus(); return; }
  state.worryText = text;
  showView("v-results");
  var body=document.getElementById("resultsBody");
  body.innerHTML='<div class="status-line"><span class="dot"></span>Driftcast is listening…</div>';

  var data=null;
  try{
    data = await callApi({ action:"curate", worry:text });
  }catch(e){
    data=null;
    if(e.status===429){ body.innerHTML='<div class="status-line">You\'re going a little fast. Give it a few minutes and try again.</div>'; return; }
  }

  if(!data || !data.bridge || !data.episodes){
    data = { bridge: FALLBACK_BRIDGES.default, episodes: FALLBACK_EPS };
  }

  var html = '<div class="bridge"><div class="k">THE BRIDGE</div><p>"'+esc(data.bridge)+'"</p><button class="voicebtn" id="bridgeVoiceBtn">▶ Play narration</button></div>';
  data.episodes.forEach(function(ep){
    html += '<div class="ep" data-t="'+encodeURIComponent(ep.title)+'" data-tag="'+encodeURIComponent(ep.tag)+'" data-src="'+esc(ep.source)+'" data-min="'+(parseInt(ep.minutes,10)||30)+'">'+
      '<div><div class="t">'+esc(ep.title)+'</div><div class="m">'+esc(ep.tag)+' · '+(parseInt(ep.minutes,10)||30)+' min</div></div><div class="badge">'+esc(ep.source)+'</div></div>';
  });
  body.innerHTML = html;
  var voiceBtn = document.getElementById("bridgeVoiceBtn");
  if(!('speechSynthesis' in window)){
    voiceBtn.disabled = true; voiceBtn.textContent = "Narration unsupported here";
  } else {
    voiceBtn.addEventListener("click", function(){ speakBridge(data.bridge, voiceBtn); });
    speakBridge(data.bridge, voiceBtn); // best-effort autoplay; falls back to the button tap above
  }
  body.querySelectorAll(".ep").forEach(function(el){
    el.addEventListener("click",function(){
      playEpisode({
        t: decodeURIComponent(el.dataset.t), tag: decodeURIComponent(el.dataset.tag),
        src: el.dataset.src, dur: parseInt(el.dataset.min,10)*60
      });
    });
  });
}
document.getElementById("curateBtn").addEventListener("click",curate);

// ---- spoken narration for the bridge (real speech, via the browser's own voice) ----
var cachedVoice = null;
function pickVoice(){
  if(!('speechSynthesis' in window)) return null;
  var voices = window.speechSynthesis.getVoices();
  if(!voices.length) return null;
  return voices.find(function(v){return /en/i.test(v.lang) && /female|samantha|victoria|karen|moira/i.test(v.name);})
    || voices.find(function(v){return /en/i.test(v.lang);}) || voices[0];
}
if('speechSynthesis' in window){
  window.speechSynthesis.onvoiceschanged = function(){ cachedVoice = pickVoice(); };
  cachedVoice = pickVoice();
}
function speakBridge(text, btn){
  if(!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  u.rate = 0.88; u.pitch = 0.92; u.volume = 1;
  var v = cachedVoice || pickVoice();
  if(v) u.voice = v;
  if(btn){
    btn.textContent = "❚❚ Playing narration";
    u.onend = function(){ btn.textContent = "▶ Play narration"; };
    u.onerror = function(){ btn.textContent = "▶ Play narration"; };
  }
  window.speechSynthesis.speak(u);
}

// ---- real synthesized ambient audio ----
var ctx=null, master=null, nodes={};
function ensureAudio(){
  if(ctx) return;
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  master=ctx.createGain(); master.gain.value=0.9; master.connect(ctx.destination);
  nodes.rain=buildLayer("lowpass",1400,false);
  nodes.brown=buildLayer("lowpass",400,true);
  nodes.fire=buildLayer("bandpass",2200,false,900);
}
function buildLayer(type,freq,brown,q){
  var bufSize=2*ctx.sampleRate, buf=ctx.createBuffer(1,bufSize,ctx.sampleRate), data=buf.getChannelData(0), lastOut=0;
  for(var i=0;i<bufSize;i++){
    var white=Math.random()*2-1;
    if(brown){ lastOut=(lastOut+0.02*white)/1.02; data[i]=lastOut*3.5; } else data[i]=white;
  }
  var src=ctx.createBufferSource(); src.buffer=buf; src.loop=true;
  var filt=ctx.createBiquadFilter(); filt.type=type; filt.frequency.value=freq; if(q)filt.Q.value=q;
  var gain=ctx.createGain(); gain.gain.value=0;
  src.connect(filt); filt.connect(gain); gain.connect(master); src.start();
  return {gain:gain};
}
function setLayer(name,pct){ ensureAudio(); nodes[name].gain.gain.value=(pct/100)*0.5; }

function fmt(s){ s=Math.max(0,Math.round(s)); var m=Math.floor(s/60),ss=s%60; return String(m).padStart(2,"0")+":"+String(ss).padStart(2,"0"); }

var FALLBACK_NARRATION = "This episode traces the quiet, procedural history of the subject at hand: the committees that met, the forms that were filed, the figures that were revised twice and then left alone. None of it was urgent. Most of it still isn't. For the next few minutes, that's rather the point. Somewhere in an office, someone signed a document, and somewhere else, someone else filed it. The weather that day was unremarkable. So was the one after. It is, on the whole, a story about nothing happening, told slowly, and on purpose, until it isn't a story anymore, just a sound.";

async function playEpisode(ep){
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
  clearTicker();
  state.current=ep; state.playing=false; state.lastFrac=0; state.narrationFull=null; state.estDur=ep.dur;
  document.getElementById("pTitle").textContent=ep.t;
  document.getElementById("pMeta").textContent="Writing the episode…";
  document.getElementById("pFill").style.width="0%";
  document.getElementById("pCur").textContent="00:00";
  document.getElementById("pDur").textContent="--:--";
  document.getElementById("playPause").disabled=true;
  showView("v-player");
  ensureAudio(); if(ctx.state==="suspended") ctx.resume();
  setLayer("rain", document.getElementById("mRain").value);

  var narration = null;
  try{
    var r = await callApi({ action:"narrate", title:ep.t, tag:ep.tag });
    if(r && r.text && r.text.trim()) narration = r.text.trim();
  }catch(e){ narration = null; }
  if(!narration) narration = FALLBACK_NARRATION;

  state.narrationFull = narration;
  var words = narration.split(/\s+/).filter(Boolean).length;
  state.estDur = Math.max(30, Math.round(words/2.5)); // ~150wpm
  document.getElementById("pDur").textContent = fmt(state.estDur);
  document.getElementById("pMeta").textContent = ep.tag+" · "+ep.src;
  document.getElementById("playPause").disabled=false;

  if('speechSynthesis' in window){
    speakFrom(narration, 0);
  } else {
    document.getElementById("pMeta").textContent += " · narration unsupported in this browser";
  }
}

function updateProgress(frac){
  frac = Math.max(0, Math.min(1, frac));
  state.lastFrac = frac;
  document.getElementById("pFill").style.width=(frac*100)+"%";
  document.getElementById("pCur").textContent=fmt(frac*state.estDur);
}

var tickHandle=null;
function clearTicker(){ if(tickHandle){ clearInterval(tickHandle); tickHandle=null; } }
function startTicker(){
  clearTicker();
  tickHandle=setInterval(function(){
    if(!state.playing || !state.estDur) return;
    var elapsedNow = state.baseElapsedSec + (Date.now()-state.playStartTs)/1000;
    updateProgress(elapsedNow/state.estDur);
  },300);
}

function speakFrom(fullText, offsetChars){
  window.speechSynthesis.cancel();
  var sub = fullText.slice(offsetChars);
  if(!sub.trim()){ togglePlay(false); updateProgress(1); clearTicker(); return; }
  var u = new SpeechSynthesisUtterance(sub);
  u.rate = 0.93; u.pitch = 0.95;
  var v = cachedVoice || pickVoice();
  if(v) u.voice = v;
  u.onend = function(){
    if(offsetChars + sub.length >= fullText.length){ togglePlay(false); updateProgress(1); clearTicker(); }
  };
  window.speechSynthesis.speak(u);
  state.playing = true;
  state.baseElapsedSec = (offsetChars/fullText.length) * state.estDur;
  state.playStartTs = Date.now();
  startTicker();
  document.getElementById("playPause").textContent="❚❚";
}

function togglePlay(force){
  var was = state.playing;
  state.playing = typeof force==="boolean" ? force : !state.playing;
  document.getElementById("playPause").textContent = state.playing?"❚❚":"▶";
  if(state.playing && !was){
    state.playStartTs = Date.now();
    startTicker();
  } else if(!state.playing && was){
    if(state.playStartTs!=null){ state.baseElapsedSec += (Date.now()-state.playStartTs)/1000; }
    clearTicker();
  }
  if('speechSynthesis' in window){
    if(state.playing){ if(window.speechSynthesis.paused) window.speechSynthesis.resume(); }
    else { window.speechSynthesis.pause(); }
  }
  if(ctx && state.playing) ctx.resume();
}
function skip(deltaSec){
  if(!state.narrationFull || !state.estDur) return;
  var curSec = state.lastFrac*state.estDur;
  var newFrac = Math.max(0, Math.min(1, (curSec+deltaSec)/state.estDur));
  var idx = Math.round(newFrac*state.narrationFull.length);
  while(idx < state.narrationFull.length && idx>0 && !/\s/.test(state.narrationFull[idx-1])) idx++;
  speakFrom(state.narrationFull, idx);
}
document.getElementById("playPause").addEventListener("click",function(){togglePlay();});
document.getElementById("skipBack").addEventListener("click",function(){ skip(-15); });
document.getElementById("skipFwd").addEventListener("click",function(){ skip(15); });
[["mRain","rain","vRain"],["mBrown","brown","vBrown"],["mFire","fire","vFire"]].forEach(function(a){
  document.getElementById(a[0]).addEventListener("input",function(e){
    setLayer(a[1], e.target.value); document.getElementById(a[2]).textContent=e.target.value+"%";
  });
});

// ---- nav shadow on scroll + reveal-on-scroll ----
var navEl=document.getElementById("nav");
function onScroll(){ navEl.classList.toggle("scrolled", window.scrollY>8); }
window.addEventListener("scroll",onScroll,{passive:true}); onScroll();
var rv=document.querySelectorAll(".reveal");
if("IntersectionObserver" in window){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}});},{threshold:.15});
  rv.forEach(function(el){io.observe(el);});
} else { rv.forEach(function(el){el.classList.add("in");}); }
document.getElementById("yr").textContent=new Date().getFullYear();
})();
