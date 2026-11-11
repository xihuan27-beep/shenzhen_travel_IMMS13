const CONFIG = {
  GOOGLE_MAPS_API_KEY: 'YOUR_GOOGLE_MAPS_API_KEY',
  SUPABASE_URL: 'YOUR_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
  // Cloudflare Worker URL (설정하면 중국에서도 접속 가능)
  // 없으면 Supabase 직접 호출
  WORKER_URL: '',

  MAP_CENTER: { lat: 22.5431, lng: 114.0579 }, // 선전 중심
  MAP_ZOOM: 12,
};

const CATEGORIES = [
  { id: 'breakfast', label: '아침', icon: '☕', color: '#FF9500' },
  { id: 'lunch',     label: '점심', icon: '🍜', color: '#FF3B30' },
  { id: 'dinner',    label: '저녁', icon: '🍖', color: '#AF52DE' },
  { id: 'cafe',      label: '카페', icon: '🍰', color: '#FF2D55' },
  { id: 'attraction',label: '관광지', icon: '🏛️', color: '#007AFF' },
  { id: 'shopping',  label: '쇼핑', icon: '🛍️', color: '#5856D6' },
  { id: 'meetup',    label: '만남의 장소', icon: '📍', color: '#34C759' },
  { id: 'top',       label: '왕추천', icon: '⭐', color: '#FFD60A' },
  { id: 'hotel',     label: '추천숙소', icon: '🏨', color: '#32ADE6' },
  { id: 'other',     label: '기타', icon: '📌', color: '#8E8E93' },
];
