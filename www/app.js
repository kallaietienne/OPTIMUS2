/* ============================================================
   OPTIMUS 2 – app.js
   ============================================================ */

let S = {
  cimek: [],
  sorrend: [],
  kovetkezoIndex: 0,
  vegrehajtas: false,
  naplo: [],
  beallitasok: {
    telephely: { cim: '', lat: null, lon: null },
    tomtomKey: '',
    width: 3,
    navApp: 'auto',
    dark: false
  }
};

const STORE_KEY = 'optimus2';
const IS_NATIVE = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();

function betolt() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const mentett = JSON.parse(raw);
      S = Object.assign(S, mentett);
      S.beallitasok = Object.assign(S.beallitasok, mentett.beallitasok || {});
    }
  } catch (e) { console.warn('Betöltés hiba', e); }
}
function ment() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { console.warn('Mentés hiba', e); }
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'scr-lista') listaRender();
  if (id === 'scr-naplo') naploRender();
  if (id === 'scr-beallitas') beallitasRender();
  if (id === 'scr-terkep') terkepInit();
}

function toast(msg, szin) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.borderColor = szin || 'var(--zold)';
  t.style.color = szin || 'var(--zold)';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

function uid() { return 'c' + Date.now() + Math.random().toString(36).slice(2, 7); }

function darkValt() {
  const be = document.getElementById('beall-dark').checked;
  S.beallitasok.dark = be;
  document.body.classList.toggle('light', !be);
  ment();
}
function darkAlkalmaz() {
  document.body.classList.toggle('light', !S.beallitasok.dark);
  const cb = document.getElementById('beall-dark');
  if (cb) cb.checked = S.beallitasok.dark;
}

function beallitasRender() {
  document.getElementById('beall-telephely').value = S.beallitasok.telephely.cim || '';
  document.getElementById('beall-tomtom').value = S.beallitasok.tomtomKey || '';
  document.getElementById('beall-width').value = S.beallitasok.width || 3;
  document.getElementById('beall-nav').value = S.beallitasok.navApp || 'auto';
  document.getElementById('beall-dark').checked = !!S.beallitasok.dark;
}

async function telephelyMentes() {
  const cim = document.getElementById('beall-telephely').value.trim();
  if (!cim) { toast('Add meg a telephely címét', 'var(--piros)'); return; }
  toast('Telephely keresése...', 'var(--kek)');
  const geo = await geokodol(cim);
  if (geo) {
    S.beallitasok.telephely = { cim: geo.cim, lat: geo.lat, lon: geo.lon };
    document.getElementById('beall-telephely').value = geo.cim;
    ment(); toast('Telephely mentve ✓');
  } else {
    toast('Nem található a cím', 'var(--piros)');
  }
}

function tomtomMentes() {
  S.beallitasok.tomtomKey = document.getElementById('beall-tomtom').value.trim();
  S.beallitasok.width = parseFloat(document.getElementById('beall-width').value) || 3;
  S.beallitasok.navApp = document.getElementById('beall-nav').value;
  ment(); toast('Beállítások mentve ✓');
}

/* ---------- TOMTOM ---------- */
async function tomtomSearch(query) {
  const key = S.beallitasok.tomtomKey;
  if (!key) { toast('Nincs TomTom kulcs', 'var(--piros)'); return []; }
  const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${key}&language=hu-HU&limit=5&countrySet=HU`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    return (d.results || []).map(x => ({
      cim: x.address.freeformAddress,
      lat: x.position.lat,
      lon: x.position.lon,
      varos: x.address.municipality || x.address.localName || ''
    }));
  } catch (e) { console.warn('TomTom search hiba', e); return []; }
}

async function geokodol(cim) {
  const tal = await tomtomSearch(cim);
  return tal.length ? tal[0] : null;
}

async function reverseGeokodol(lat, lon) {
  const key = S.beallitasok.tomtomKey;
  if (!key) return null;
  const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?key=${key}&language=hu-HU`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const a = d.addresses && d.addresses[0];
    if (!a) return null;
    return {
      cim: a.address.freeformAddress,
      varos: a.address.municipality || a.address.localName || ''
    };
  } catch (e) { console.warn('Reverse geocode hiba', e); return null; }
}

async function tomtomRoute(from, to) {
  const key = S.beallitasok.tomtomKey;
  if (!key) return null;
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json?key=${key}&routeType=fastest&traffic=false&maxAlternatives=2&instructionsType=text`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    return (d.routes || []).map(rt => ({
      pontok: (rt.legs || []).flatMap(l => l.points || []).map(p => ({ lat: p.latitude, lon: p.longitude })),
      hossz: rt.summary ? rt.summary.lengthInMeters / 1000 : 0
    }));
  } catch (e) { console.warn('Route hiba', e); return null; }
}

/* ---------- CÍM ŰRLAP ---------- */
function ujCimUres() {
  document.getElementById('szerkeszt-id').value = '';
  document.getElementById('uj-cim').value = '';
  document.getElementById('uj-nev').value = '';
  document.getElementById('uj-tel').value = '';
  document.getElementById('uj-megj').value = '';
  document.getElementById('ujcim-cim').textContent = 'Új cím';
  document.getElementById('uj-mentes-btn').innerHTML = '<span class="ico">💾</span> Mentés';
  document.getElementById('uj-cim-javaslatok').innerHTML = '';
  show('scr-ujcim');
}

function szerkesztCim(id) {
  const c = S.cimek.find(x => x.id === id);
  if (!c) return;
  document.getElementById('szerkeszt-id').value = id;
  document.getElementById('uj-cim').value = c.cim;
  document.getElementById('uj-nev').value = c.nev || '';
  document.getElementById('uj-tel').value = c.telefon || '';
  document.getElementById('uj-megj').value = c.megjegyzes || '';
  document.getElementById('ujcim-cim').textContent = 'Cím szerkesztése';
  document.getElementById('uj-mentes-btn').innerHTML = '<span class="ico">💾</span> Módosítás mentése';
  show('scr-ujcim');
}

async function ujCimMentes() {
  const id = document.getElementById('szerkeszt-id').value;
  const cim = document.getElementById('uj-cim').value.trim();
  const nev = document.getElementById('uj-nev').value.trim();
  const telefon = document.getElementById('uj-tel').value.trim();
  const megjegyzes = document.getElementById('uj-megj').value.trim();
  if (!cim) { toast('Add meg a címet', 'var(--piros)'); return; }

  let lat = null, lon = null, varos = '';
  if (id) {
    const regi = S.cimek.find(x => x.id === id);
    if (regi && regi.cim === cim) { lat = regi.lat; lon = regi.lon; varos = regi.varos; }
  }
  if (lat === null) {
    toast('Cím keresése...', 'var(--kek)');
    const geo = await geokodol(cim);
    if (!geo) { toast('Nem található a cím – próbáld térképről', 'var(--piros)'); return; }
    lat = geo.lat; lon = geo.lon; varos = geo.varos;
  }

  if (id) {
    const c = S.cimek.find(x => x.id === id);
    Object.assign(c, { cim, nev, telefon, megjegyzes, lat, lon, varos });
    toast('Cím módosítva ✓');
  } else {
    S.cimek.push({ id: uid(), cim, nev, telefon, megjegyzes, lat, lon, varos, allapot: null, lock: false });
    toast('Cím hozzáadva ✓');
  }
  ment(); show('scr-lista');
}

/* ---------- NÉVJEGY ---------- */
async function nevjegyValaszt() {
  if (!IS_NATIVE) { toast('Névjegy csak APK-ban működik', 'var(--piros)'); return; }
  try {
    const { Contacts } = Capacitor.Plugins;
    const perm = await Contacts.requestPermissions();
    if (perm.contacts !== 'granted') { toast('Névjegy engedély szükséges', 'var(--piros)'); return; }
    const result = await Contacts.pickContact({
      projection: { name: true, phones: true, addresses: true }
    });
    if (result && result.contact) {
      const c = result.contact;
      if (c.name && c.name.display) document.getElementById('uj-nev').value = c.name.display;
      if (c.phones && c.phones.length) document.getElementById('uj-tel').value = c.phones[0].number;
      if (c.addresses && c.addresses.length) {
        const a = c.addresses[0];
        const cim = [a.street, a.city, a.postalCode].filter(Boolean).join(', ');
        if (cim) document.getElementById('uj-cim').value = cim;
      }
      toast('Névjegy betöltve ✓');
    }
  } catch (e) {
    console.warn('Névjegy hiba', e);
    toast('Névjegy hiba', 'var(--piros)');
  }
}

/* ---------- KERESŐ ---------- */
let keresesTimer = null;
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('uj-cim');
  if (inp) {
    inp.addEventListener('input', () => {
      clearTimeout(keresesTimer);
      const q = inp.value.trim();
      if (q.length < 3) { document.getElementById('uj-cim-javaslatok').innerHTML = ''; return; }
      keresesTimer = setTimeout(async () => {
        const tal = await tomtomSearch(q);
        const kont = document.getElementById('uj-cim-javaslatok');
        kont.innerHTML = '';
        tal.forEach(t => {
          const d = document.createElement('div');
          d.className = 'suggestion-item';
          d.textContent = t.cim;
          d.onclick = () => {
            document.getElementById('uj-cim').value = t.cim;
            kont.innerHTML = '';
            document.getElementById('uj-cim').dataset.lat = t.lat;
            document.getElementById('uj-cim').dataset.lon = t.lon;
            document.getElementById('uj-cim').dataset.varos = t.varos;
          };
          kont.appendChild(d);
        });
      }, 400);
    });
  }
  darkAlkalmaz();
  betolt();
  darkAlkalmaz();
  if (!S.beallitasok.tomtomKey) {
    document.getElementById('modal-tomtom').classList.add('active');
  }
  if (IS_NATIVE) {
    const g = document.getElementById('nevjegy-gomb');
    if (g) g.style.display = 'flex';
  }
  listaRender();
});

function modalTomTomMentes() {
  const k = document.getElementById('modal-tomtom-input').value.trim();
  if (!k) { toast('Add meg a kulcsot', 'var(--piros)'); return; }
  S.beallitasok.tomtomKey = k;
  ment();
  document.getElementById('modal-tomtom').classList.remove('active');
  toast('Kulcs mentve ✓');
}

/* ---------- TÉRKÉP ---------- */
let terkepObj = null;
function terkepInit() {
  if (terkepObj) return;
  if (typeof L === 'undefined') {
    document.getElementById('terkep').innerHTML = '<div class="empty"><div class="ico">🗺️</div>Térkép betöltése...</div>';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = terkepLetrehoz;
    document.head.appendChild(script);
  } else terkepLetrehoz();
}

function terkepLetrehoz() {
  if (terkepObj) return;
  const alap = S.beallitasok.telephely.lat
    ? [S.beallitasok.telephely.lat, S.beallitasok.telephely.lon]
    : [47.4979, 19.0402];
  terkepObj = L.map('terkep').setView(alap, 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(terkepObj);

  if (S.beallitasok.telephely.lat) {
    L.marker(alap, { title: 'Telephely (A)' }).addTo(terkepObj).bindPopup('🏠 Telephely (A)');
  }
  S.cimek.forEach((c, i) => {
    if (c.lat && c.lon) {
      L.marker([c.lat, c.lon]).addTo(terkepObj)
        .bindPopup(`<b>${i+1}. ${c.cim}</b><br>${c.nev || ''}`);
    }
  });

  terkepObj.on('click', async (e) => {
    const { lat, lng } = e.latlng;
    toast('Cím keresése...', 'var(--kek)');
    const geo = await reverseGeokodol(lat, lng);
    if (!geo) { toast('Nem található cím', 'var(--piros)'); return; }
    ujCimUres();
    document.getElementById('uj-cim').value = geo.cim;
    document.getElementById('uj-cim').dataset.lat = lat;
    document.getElementById('uj-cim').dataset.lon = lng;
    document.getElementById('uj-cim').dataset.varos = geo.varos;
    terkepObj.setView([lat, lng], 15);
  });
}

function terkepreMegy() {
  show('scr-terkep');
}

/* ---------- LISTA ---------- */
function listaRender() {
  const kont = document.getElementById('lista-tartalom');
  if (!S.cimek.length) {
    kont.innerHTML = '<div class="empty"><div class="ico">📋</div>Még nincs cím.<br>Adj hozzá az ➕ gombbal.</div>';
    return;
  }
  if (!S.sorrend.length) {
    kont.innerHTML = '<div class="empty"><div class="ico">🔄</div>Nyomd meg az Optimalizálás gombot.</div>';
    return;
  }
  let html = '';
  S.sorrend.forEach((id, i) => {
    const c = S.cimek.find(x => x.id === id);
    if (!c) return;
    const kov = S.vegrehajtas && i === S.kovetkezoIndex;
    const osztaly = 'cim-sor' + (kov ? ' kovetkezo' : '') + (c.allapot === 'kesz' ? ' kesz' : '') + (c.allapot === 'nem' ? ' nem' : '');
    html += `<div class="${osztaly}">
      <div class="sorszam">${i+1}</div>
      <div class="tartalom">
        <div class="cim-nev">${c.cim}</div>
        <div class="cim-al">${c.nev || ''}${c.telefon ? ' · ' + c.telefon : ''}</div>
        ${c.varos ? `<span class="cim-tag tag-folyoso">${c.varos}</span>` : ''}
        ${S.vegrehajtas && kov ? `<div class="vegrehajtas-gombok">
          <button class="vg-btn vg-kesz" onclick="cimKesz('${id}')">✓ Kész</button>
          <button class="vg-btn vg-nem" onclick="cimNem('${id}')">✗ Nem</button>
        </div>` : ''}
      </div>
      <div class="akciok">
        <button class="icon-btn" onclick="szerkesztCim('${id}')">✏️</button>
        <button class="icon-btn zold" onclick="navigacioIndit('${id}')">🧭</button>
        <button class="icon-btn sarga" onclick="hivasIndit('${id}')">📞</button>
      </div>
    </div>`;
  });
  kont.innerHTML = html;
}

/* ---------- VÉGREHAJTÁS ---------- */
function vegrehajtasValt() {
  S.vegrehajtas = document.getElementById('vegrehajtas-mod').checked;
  S.kovetkezoIndex = 0;
  S.cimek.forEach(c => c.allapot = null);
  ment();
  listaRender();
}

function cimKesz(id) {
  const c = S.cimek.find(x => x.id === id);
  if (c) { c.allapot = 'kesz'; }
  S.kovetkezoIndex++;
  ment(); listaRender();
  if (S.kovetkezoIndex >= S.sorrend.length) {
    kiszallitasKesz();
  }
}

function cimNem(id) {
  const c = S.cimek.find(x => x.id === id);
  if (c) { c.allapot = 'nem'; }
  S.kovetkezoIndex++;
  ment(); listaRender();
  if (S.kovetkezoIndex >= S.sorrend.length) {
    kiszallitasKesz();
  }
}

/* ---------- KISZÁLLÍTÁS KÉSZ ---------- */
function kiszallitasKesz() {
  naploMent();
  const kesz = S.cimek.filter(c => c.allapot === 'kesz').length;
  const nem = S.cimek.filter(c => c.allapot === 'nem').length;
  const ossz = S.cimek.length;
  document.getElementById('kiszallitas-osszegzes').innerHTML =
    `<b>${ossz}</b> cím a körben.<br>
     ✅ Kész: <b style="color:var(--zold)">${kesz}</b><br>
     ❌ Nem teljesített: <b style="color:var(--piros)">${nem}</b>`;
  document.getElementById('modal-kiszallitas').classList.add('active');
}

function ujKiszallitas() {
  document.getElementById('modal-kiszallitas').classList.remove('active');
  S.cimek.forEach(c => c.allapot = null);
  S.kovetkezoIndex = 0;
  ment();
  listaRender();
  toast('Új kiszállítás indítva 🚀', 'var(--zold)');
}

function kiszallitasNaplo() {
  document.getElementById('modal-kiszallitas').classList.remove('active');
  show('scr-naplo');
}

/* ---------- NAVIGÁCIÓ / HÍVÁS ---------- */
function navigacioIndit(id) {
  const c = S.cimek.find(x => x.id === id);
  if (!c || !c.lat) { toast('Nincs koordináta', 'var(--piros)'); return; }
  const app = S.beallitasok.navApp;
  let url;
  if (app === 'waze') url = `https://waze.com/ul?ll=${c.lat},${c.lon}&navigate=yes`;
  else if (app === 'google') url = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}`;
  else url = `geo:${c.lat},${c.lon}?q=${c.lat},${c.lon}(${encodeURIComponent(c.cim)})`;
  window.open(url, '_system');
}

function hivasIndit(id) {
  const c = S.cimek.find(x => x.id === id);
  if (!c || !c.telefon) { toast('Nincs telefonszám', 'var(--piros)'); return; }
  window.open('tel:' + c.telefon, '_system');
}

/* ---------- NAPLÓ ---------- */
function naploMent() {
  S.naplo.unshift({
    datum: new Date().toISOString(),
    cimek: JSON.parse(JSON.stringify(S.cimek)),
    sorrend: [...S.sorrend]
  });
  if (S.naplo.length > 100) S.naplo.pop();
  ment();
}

function naploRender() {
  const kont = document.getElementById('naplo-tartalom');
  if (!S.naplo.length) {
    kont.innerHTML = '<div class="empty"><div class="ico">📅</div>Még nincs naplóbejegyzés.</div>';
    return;
  }
  kont.innerHTML = S.naplo.map((n, i) => {
    const d = new Date(n.datum);
    const datum = d.toLocaleDateString('hu-HU') + ' ' + d.toLocaleTimeString('hu-HU', {hour:'2-digit',minute:'2-digit'});
    return `<div class="naplo-item" onclick="naploBetolt(${i})">
      <div class="datum">${datum}</div>
      <div class="db">${n.cimek.length} cím</div>
    </div>`;
  }).join('');
}

function naploBetolt(i) {
  const n = S.naplo[i];
  if (!n) return;
  S.cimek = JSON.parse(JSON.stringify(n.cimek));
  S.sorrend = [...n.sorrend];
  S.kovetkezoIndex = 0;
  ment();
  show('scr-lista');
  toast('Napló betöltve');
}

/* ---------- OPTIMALIZÁLÁS ---------- */
async function optimalizalasIndit() {
  const telephely = S.beallitasok.telephely;
  if (!telephely.lat) { toast('Először állítsd be a telephelyet', 'var(--piros)'); return; }
  const hasznalhato = S.cimek.filter(c => c.lat && c.lon && !c.allapot);
  if (!hasznalhato.length) { toast('Nincs optimalizálható cím', 'var(--piros)'); return; }

  toast('Optimalizálás...', 'var(--kek)');
  await new Promise(r => setTimeout(r, 100));

  const A = { lat: telephely.lat, lon: telephely.lon };
  const T = S.beallitasok.width || 3;

  const sik = hasznalhato.map(c => ({
    id: c.id,
    x: (c.lon - A.lon) * Math.cos(A.lat * Math.PI/180) * 111.32,
    y: (c.lat - A.lat) * 110.57,
    cim: c
  }));

  let B = sik[0], maxD = 0;
  sik.forEach(p => {
    const d = Math.hypot(p.x, p.y);
    if (d > maxD) { maxD = d; B = p; }
  });

  const routeAB = await tomtomRoute(A, {lat: B.cim.lat, lon: B.cim.lon});
  const vonal = routeAB && routeAB[0] ? routeAB[0].pontok : [{lat: A.lat, lon: A.lon}, {lat: B.cim.lat, lon: B.cim.lon}];

  const projekt = (lat, lon) => {
    let minD = Infinity, s = 0, cum = 0;
    for (let i = 0; i < vonal.length - 1; i++) {
      const p1 = vonal[i], p2 = vonal[i+1];
      const dx = (p2.lon - p1.lon) * Math.cos(lat*Math.PI/180) * 111.32;
      const dy = (p2.lat - p1.lat) * 110.57;
      const szeg = Math.hypot(dx, dy);
      const px = (lon - p1.lon) * Math.cos(lat*Math.PI/180) * 111.32;
      const py = (lat - p1.lat) * 110.57;
      const t = Math.max(0, Math.min(1, (px*dx + py*dy) / (szeg*szeg || 1)));
      const tx = dx * t, ty = dy * t;
      const d = Math.hypot(px - tx, py - ty);
      if (d < minD) { minD = d; s = cum + t * szeg; }
      cum += szeg;
    }
    return { d: minD, s };
  };

  const projektalt = sik.map(p => {
    const pr = projekt(p.cim.lat, p.cim.lon);
    return { ...p, d: pr.d, s: pr.s, folyoso: pr.d <= T };
  });

  projektalt.sort((a, b) => a.s - b.s);

  S.sorrend = [B.cim.id, ...projektalt.filter(p => p.id !== B.cim.id).map(p => p.id)];
  S.sorrend = S.sorrend.filter(id => id !== 'A');
  S.kovetkezoIndex = 0;
  S.cimek.forEach(c => c.allapot = null);
  ment();

  const ossz = {
    db: hasznalhato.length,
    folyoso: projektalt.filter(p => p.folyoso).length,
    ag: projektalt.filter(p => !p.folyoso).length,
    T
  };
  document.getElementById('modal-osszegzes-tartalom').innerHTML =
    `<b>${ossz.db}</b> cím optimalizálva.<br>
     Folyosó: <b>${ossz.folyoso}</b> · Ág: <b>${ossz.ag}</b><br>
     Folyosószélesség: <b>${ossz.T} km</b><br><br>
     <span style="color:var(--halvany);font-size:13px;">A sorrend a listában látható.</span>`;
  document.getElementById('modal-osszegzes').classList.add('active');
  listaRender();
}

function modalOsszegzesBezar() {
  document.getElementById('modal-osszegzes').classList.remove('active');
  show('scr-lista');
}

/* ---------- EXPORT / IMPORT ---------- */
function exportAdat() {
  const data = JSON.stringify(S, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'optimus2-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Exportálva ✓');
}

function importAdat(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      S = Object.assign(S, d);
      ment();
      darkAlkalmaz();
      listaRender();
      toast('Importálva ✓');
    } catch (err) { toast('Hibás fájl', 'var(--piros)'); }
  };
  reader.readAsText(f);
  ev.target.value = '';
}
