// ─── 상태 ──────────────────────────────────────────────────────────────────
let map, autocomplete;
let markers = {};
let places = [];
let activeCategory = 'all';
let activeSort = 'recent';
let selectedPlace = null;

// ─── API ───────────────────────────────────────────────────────────────────
const baseUrl = CONFIG.WORKER_URL || CONFIG.SUPABASE_URL;

async function apiFetch(path, options = {}) {
  const url = CONFIG.WORKER_URL
    ? `${CONFIG.WORKER_URL}${path}`
    : `${CONFIG.SUPABASE_URL}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

async function loadPlaces() {
  return apiFetch('/rest/v1/places?select=*&order=created_at.desc');
}

async function savePlace(data) {
  return apiFetch('/rest/v1/places', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
}

async function checkDuplicate(googlePlaceId) {
  const result = await apiFetch(`/rest/v1/places?google_place_id=eq.${googlePlaceId}&select=id`);
  return result && result.length > 0 ? result[0] : null;
}

async function incrementWants(placeId) {
  return apiFetch('/rest/v1/rpc/increment_wants', {
    method: 'POST',
    body: JSON.stringify({ place_id: placeId }),
  });
}

// ─── 지도 ──────────────────────────────────────────────────────────────────
function initMap() {
  if (!CONFIG.GOOGLE_MAPS_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY') {
    showSetupBanner();
    return;
  }

  map = new google.maps.Map(document.getElementById('map'), {
    center: CONFIG.MAP_CENTER,
    zoom: CONFIG.MAP_ZOOM,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    styles: getMapStyles(),
  });

  initAutocomplete();
  loadAndRender();
}

function initAutocomplete() {
  const input = document.getElementById('search-input');
  autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ['place_id', 'name', 'geometry', 'formatted_address', 'rating'],
  });
  autocomplete.addListener('place_changed', onPlaceSelected);
}

async function onPlaceSelected() {
  const place = autocomplete.getPlace();
  if (!place.geometry) return;

  // 중국어 이름 가져오기
  const zhName = await fetchChineseName(place.place_id);
  const pinyin = zhName ? toPinyin(zhName) : '';

  document.getElementById('preview-name-ko').textContent = document.getElementById('search-input').value;
  document.getElementById('preview-name-zh').textContent = zhName || '';
  document.getElementById('preview-pinyin').textContent = pinyin;
  document.getElementById('preview-rating').textContent = place.rating ? `⭐ ${place.rating}` : '';
  document.getElementById('preview-address').textContent = place.formatted_address || '';

  document.getElementById('add-preview').classList.remove('hidden');

  // 임시로 선택된 장소 저장
  selectedPlace = {
    name_ko: document.getElementById('search-input').value,
    name_zh: zhName || null,
    name_pinyin: pinyin || null,
    address: place.formatted_address || null,
    lat: place.geometry.location.lat(),
    lng: place.geometry.location.lng(),
    google_place_id: place.place_id,
    google_rating: place.rating || null,
  };
}

async function fetchChineseName(placeId) {
  return new Promise((resolve) => {
    const service = new google.maps.places.PlacesService(map);
    service.getDetails(
      { placeId, fields: ['name'], language: 'zh-CN' },
      (result, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          resolve(result.name);
        } else {
          resolve(null);
        }
      }
    );
  });
}

function addMarker(place) {
  const cat = CATEGORIES.find(c => c.id === place.category) || CATEGORIES[CATEGORIES.length - 1];
  const marker = new google.maps.Marker({
    position: { lat: place.lat, lng: place.lng },
    map,
    title: place.name_ko,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: cat.color,
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 2,
      scale: 10,
    },
  });
  marker.addListener('click', () => openDetail(place));
  markers[place.id] = marker;
  return marker;
}

function clearMarkers() {
  Object.values(markers).forEach(m => m.setMap(null));
  markers = {};
}

function locateMe() {
  if (!navigator.geolocation) return alert('위치 정보를 사용할 수 없습니다.');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const pos = { lat: coords.latitude, lng: coords.longitude };
      map.panTo(pos);
      new google.maps.Marker({
        position: pos,
        map,
        title: '내 위치',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#007AFF',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3,
          scale: 8,
        },
        zIndex: 999,
      });
    },
    () => alert('위치를 가져올 수 없습니다.')
  );
}

// ─── 렌더링 ────────────────────────────────────────────────────────────────
async function loadAndRender() {
  showLoading(true);
  try {
    places = await loadPlaces();
    renderAll();
  } catch (e) {
    console.error(e);
    showError('장소를 불러오지 못했습니다.');
  }
  showLoading(false);
}

function renderAll() {
  clearMarkers();
  const filtered = filterPlaces(places);
  renderCards(filtered);
  filtered.forEach(addMarker);
  updateCount(filtered.length);
}

function filterPlaces(list) {
  let result = activeCategory === 'all' ? list : list.filter(p => p.category === activeCategory);
  if (activeSort === 'popular') result = [...result].sort((a, b) => b.wants_count - a.wants_count);
  return result;
}

function renderCards(list) {
  const container = document.getElementById('places-list');
  if (list.length === 0) {
    container.innerHTML = '<p class="empty-msg">아직 등록된 장소가 없어요.<br>첫 번째로 추가해보세요! 🗺️</p>';
    return;
  }
  container.innerHTML = list.map(placeCard).join('');
  container.querySelectorAll('.place-card').forEach(card => {
    card.addEventListener('click', () => {
      const place = places.find(p => p.id === card.dataset.id);
      if (place) openDetail(place);
    });
  });
}

function placeCard(place) {
  const cat = CATEGORIES.find(c => c.id === place.category) || CATEGORIES[CATEGORIES.length - 1];
  const liked = isLiked(place.id);
  return `
    <div class="place-card" data-id="${place.id}">
      <div class="card-header">
        <span class="category-badge" style="background:${cat.color}20;color:${cat.color}">
          ${cat.icon} ${cat.label}
        </span>
        ${place.google_rating ? `<span class="rating">⭐ ${place.google_rating}</span>` : ''}
      </div>
      <div class="card-body">
        <div class="place-name-ko">${esc(place.name_ko)}</div>
        ${place.name_zh ? `<div class="place-name-zh">${esc(place.name_zh)}${place.name_pinyin ? `  <span class="pinyin">${esc(place.name_pinyin)}</span>` : ''}</div>` : ''}
      </div>
      <div class="card-footer">
        <span class="wants ${liked ? 'liked' : ''}">♥ ${place.wants_count}명</span>
      </div>
    </div>
  `;
}

// ─── 장소 상세 ─────────────────────────────────────────────────────────────
function openDetail(place) {
  const cat = CATEGORIES.find(c => c.id === place.category) || CATEGORIES[CATEGORIES.length - 1];
  const liked = isLiked(place.id);
  const modal = document.getElementById('modal-detail');

  document.getElementById('detail-category').textContent = `${cat.icon} ${cat.label}`;
  document.getElementById('detail-category').style.color = cat.color;
  document.getElementById('detail-name-ko').textContent = place.name_ko;
  document.getElementById('detail-name-zh').textContent = place.name_zh || '';
  document.getElementById('detail-pinyin').textContent = place.name_pinyin || '';
  document.getElementById('detail-rating').textContent = place.google_rating ? `⭐ ${place.google_rating}` : '';
  document.getElementById('detail-address').textContent = place.address || '';
  document.getElementById('detail-wants').textContent = `♥ ${place.wants_count}명`;
  document.getElementById('detail-wants').className = `wants-btn ${liked ? 'liked' : ''}`;

  const wantsBtn = document.getElementById('detail-wants');
  wantsBtn.onclick = () => handleWants(place, wantsBtn);

  document.getElementById('detail-amap').onclick = () => openAmap(place);

  if (map) map.panTo({ lat: place.lat, lng: place.lng });

  modal.classList.remove('hidden');
  modal.classList.add('visible');
}

async function handleWants(place, btn) {
  if (isLiked(place.id)) return;
  try {
    await incrementWants(place.id);
    place.wants_count += 1;
    setLiked(place.id);
    btn.textContent = `♥ ${place.wants_count}명`;
    btn.classList.add('liked');
    // 카드도 업데이트
    const card = document.querySelector(`.place-card[data-id="${place.id}"] .wants`);
    if (card) { card.textContent = `♥ ${place.wants_count}명`; card.classList.add('liked'); }
  } catch (e) {
    console.error(e);
  }
}

function openAmap(place) {
  const gcj = wgs84ToGcj02(place.lng, place.lat);
  const name = encodeURIComponent(place.name_zh || place.name_ko);
  // 高德 딥링크 (앱) + 웹 fallback
  const appUrl = `androidamap://viewMap?sourceApplication=shenzhen-trip&poiname=${name}&lat=${gcj.lat}&lon=${gcj.lng}&dev=0`;
  const webUrl = `https://uri.amap.com/marker?position=${gcj.lng},${gcj.lat}&name=${name}&src=shenzhen-trip&coordinate=gcj02`;
  // iOS/Android 분기
  window.location.href = appUrl;
  setTimeout(() => { window.open(webUrl, '_blank'); }, 1500);
}

// ─── 장소 추가 ─────────────────────────────────────────────────────────────
async function handleAddPlace(e) {
  e.preventDefault();
  if (!selectedPlace) return;

  const category = document.getElementById('select-category').value;
  if (!category) { alert('카테고리를 선택해주세요.'); return; }

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    // 중복 체크
    if (selectedPlace.google_place_id) {
      const dup = await checkDuplicate(selectedPlace.google_place_id);
      if (dup) {
        closeAddModal();
        const dupPlace = places.find(p => p.id === dup.id);
        if (dupPlace) openDetail(dupPlace);
        else {
          places = await loadPlaces();
          const found = places.find(p => p.id === dup.id);
          if (found) openDetail(found);
        }
        showToast('이미 등록된 장소예요. 가고 싶어요를 눌러보세요! 💛');
        return;
      }
    }

    const [newPlace] = await savePlace({ ...selectedPlace, category });
    places.unshift(newPlace);
    renderAll();
    addMarker(newPlace);
    closeAddModal();
    showToast('장소가 추가됐어요! 🎉');
  } catch (err) {
    console.error(err);
    alert('저장 중 오류가 발생했습니다.');
  } finally {
    btn.disabled = false;
    btn.textContent = '추가하기';
  }
}

// ─── 좋아요 로컬 저장 ──────────────────────────────────────────────────────
function isLiked(id) {
  try { return JSON.parse(localStorage.getItem('likes') || '[]').includes(id); }
  catch { return false; }
}
function setLiked(id) {
  try {
    const likes = JSON.parse(localStorage.getItem('likes') || '[]');
    if (!likes.includes(id)) { likes.push(id); localStorage.setItem('likes', JSON.stringify(likes)); }
  } catch {}
}

// ─── 좌표 변환 WGS84 → GCJ02 ─────────────────────────────────────────────
function wgs84ToGcj02(lng, lat) {
  const a = 6378245.0, ee = 0.00669342162296594323;
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sq = Math.sqrt(magic);
  return {
    lat: lat + (dLat * 180.0) / ((a * (1 - ee)) / (magic * sq) * Math.PI),
    lng: lng + (dLng * 180.0) / (a / sq * Math.cos(radLat) * Math.PI),
  };
}
function transformLat(x, y) {
  let r = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
  r += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3;
  r += (20*Math.sin(y*Math.PI) + 40*Math.sin(y/3*Math.PI)) * 2/3;
  r += (160*Math.sin(y/12*Math.PI) + 320*Math.sin(y*Math.PI/30)) * 2/3;
  return r;
}
function transformLng(x, y) {
  let r = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
  r += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3;
  r += (20*Math.sin(x*Math.PI) + 40*Math.sin(x/3*Math.PI)) * 2/3;
  r += (150*Math.sin(x/12*Math.PI) + 300*Math.sin(x*Math.PI/30)) * 2/3;
  return r;
}

// ─── 병음 변환 (간단 버전) ─────────────────────────────────────────────────
// pinyin-pro 라이브러리 사용
function toPinyin(zhText) {
  if (typeof pinyinPro === 'undefined') return '';
  try { return pinyinPro.pinyin(zhText, { toneType: 'symbol', type: 'string' }); }
  catch { return ''; }
}

// ─── UI 헬퍼 ───────────────────────────────────────────────────────────────
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showLoading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}
function showError(msg) {
  document.getElementById('places-list').innerHTML = `<p class="empty-msg">${msg}</p>`;
}
function updateCount(n) {
  document.getElementById('place-count').textContent = `${n}곳`;
}
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

function openAddModal() {
  selectedPlace = null;
  document.getElementById('search-input').value = '';
  document.getElementById('select-category').value = '';
  document.getElementById('add-preview').classList.add('hidden');
  document.getElementById('modal-add').classList.remove('hidden');
  document.getElementById('modal-add').classList.add('visible');
  setTimeout(() => document.getElementById('search-input').focus(), 100);
}
function closeAddModal() {
  document.getElementById('modal-add').classList.remove('visible');
  setTimeout(() => document.getElementById('modal-add').classList.add('hidden'), 300);
}
function closeDetailModal() {
  document.getElementById('modal-detail').classList.remove('visible');
  setTimeout(() => document.getElementById('modal-detail').classList.add('hidden'), 300);
}

function showSetupBanner() {
  document.getElementById('setup-banner').classList.remove('hidden');
}

// ─── 모바일 탭 ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('map-container').classList.toggle('mobile-hidden', tab !== 'map');
  document.getElementById('sidebar').classList.toggle('mobile-hidden', tab !== 'list');
}

// ─── 이벤트 바인딩 ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 카테고리 필터
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.category;
      renderAll();
    });
  });

  // 정렬
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSort = btn.dataset.sort;
      renderAll();
    });
  });

  // 모달 버튼
  document.getElementById('btn-add-place').addEventListener('click', openAddModal);
  document.getElementById('btn-locate').addEventListener('click', locateMe);
  document.getElementById('btn-close-add').addEventListener('click', closeAddModal);
  document.getElementById('btn-close-detail').addEventListener('click', closeDetailModal);
  document.getElementById('form-add').addEventListener('submit', handleAddPlace);

  // 모달 배경 클릭 닫기
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el) {
        closeAddModal();
        closeDetailModal();
      }
    });
  });

  // 모바일 탭
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Google Maps 동적 로드
  if (CONFIG.GOOGLE_MAPS_API_KEY && CONFIG.GOOGLE_MAPS_API_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY') {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.GOOGLE_MAPS_API_KEY}&libraries=places&callback=initMap&language=ko`;
    script.async = true;
    document.head.appendChild(script);
  } else {
    showSetupBanner();
  }
});

// Google Maps 콜백을 전역으로 노출
window.initMap = initMap;

// ─── 지도 스타일 ───────────────────────────────────────────────────────────
function getMapStyles() {
  return [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  ];
}
