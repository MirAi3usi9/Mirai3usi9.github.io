export function genId() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 8); }
export function pad(n) { return n < 10 ? '0' + n : '' + n; }
export function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function isMobile() { return window.innerWidth < 768; }

export function getIcon(type) {
  const icons = { house: '🏠', room: '🚪', container: '🗄️', box: '📦', item: '🏷️' };
  return icons[type] || '📋';
}

export function getEntityTypeName(type) {
  const names = { house: '小窝', room: '房间', container: '柜子', box: '盒子', item: '物品' };
  return names[type] || '';
}

export function getTypeLabel(entity, type) {
  if (type === 'house') return '小窝';
  if (type === 'room' || type === 'container') return entity.type || '';
  if (type === 'box') return entity.color ? '🎨' : '';
  if (type === 'item') return entity.category || '';
  return '';
}

export const CHILD_KEYS = {
  house: ['rooms'],
  room: ['containers', 'boxes', 'items'],
  container: ['boxes', 'items'],
  box: ['boxes', 'items'],
};

export function keyToType(key) {
  return key === 'rooms' ? 'room' : key === 'containers' ? 'container' : key === 'boxes' ? 'box' : 'item';
}

export function childKeyFor(childType) {
  return childType === 'room' ? 'rooms' : childType === 'container' ? 'containers' : childType === 'box' ? 'boxes' : 'items';
}

export function canContain(parentType, childType) {
  if (childType === 'house') return false;
  if (childType === 'room') return parentType === 'house';
  if (childType === 'container') return parentType === 'room';
  if (childType === 'box') return ['room', 'container', 'box'].includes(parentType);
  if (childType === 'item') return ['room', 'container', 'box'].includes(parentType);
  return false;
}

export function ensureArray(obj, key) { if (!obj[key]) obj[key] = []; }

export function removeFromArray(arr, id) {
  if (!arr) return false;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].id === id) { arr.splice(i, 1); return true; }
  }
  return false;
}

export function getChildren(entity, type) {
  const arr = [];
  if (type === 'house') {
    ensureArray(entity, 'rooms');
    entity.rooms.forEach(r => arr.push({ entity: r, type: 'room' }));
  } else if (type === 'room') {
    ensureArray(entity, 'containers');
    ensureArray(entity, 'boxes');
    ensureArray(entity, 'items');
    entity.containers.forEach(c => arr.push({ entity: c, type: 'container' }));
    entity.boxes.forEach(b => arr.push({ entity: b, type: 'box' }));
    entity.items.forEach(i => arr.push({ entity: i, type: 'item' }));
  } else if (type === 'container' || type === 'box') {
    ensureArray(entity, 'boxes');
    ensureArray(entity, 'items');
    entity.boxes.forEach(b => arr.push({ entity: b, type: 'box' }));
    entity.items.forEach(i => arr.push({ entity: i, type: 'item' }));
  }
  return arr;
}

export function cloneEntity(entity, type) {
  const clone = JSON.parse(JSON.stringify(entity));
  function renewIds(obj, t) { obj.id = genId(); (CHILD_KEYS[t] || []).forEach(k => (obj[k] || []).forEach(c => renewIds(c, keyToType(k)))); }
  renewIds(clone, type);
  return clone;
}

export function compressImageToWebP(file, maxWidth = 900, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('转换为 WebP 失败')); return; }
          const r = new FileReader();
          r.onload = (ev) => resolve(ev.target.result);
          r.readAsDataURL(blob);
        }, 'image/webp', quality);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export const PRESETS = {
  roomType: ['卧室', '客厅', '厨房', '卫生间', '阳台', '书房', '储物间'],
  containerType: ['衣柜', '橱柜', '抽屉柜', '书架', '鞋柜', '杂物柜'],
  boxColors: ['#FFB7C5', '#FF9EB5', '#FFC2D1', '#FF85A2', '#FF6B9D', '#FFA6C9', '#F4A6CD', '#F7B7D3', '#F8C8DC'],
};

export const DEFAULT_CATEGORIES = [
  { id: 'cat-clothing', name: '衣物' },
  { id: 'cat-books', name: '书籍' },
  { id: 'cat-electronics', name: '电子产品' },
  { id: 'cat-tools', name: '工具' },
  { id: 'cat-food', name: '食品' },
  { id: 'cat-documents', name: '文件' },
  { id: 'cat-medicine', name: '药品' },
  { id: 'cat-cosmetics', name: '化妆品' },
  { id: 'cat-accessories', name: '饰品' },
  { id: 'cat-toys', name: '玩具' },
  { id: 'cat-daily', name: '日用品' },
];

export const DEFAULT_TAGS = [
  { id: 'tag-common', name: '常用' },
  { id: 'tag-seasonal', name: '季节' },
  { id: 'tag-backup', name: '备用' },
  { id: 'tag-important', name: '重要' },
  { id: 'tag-todo', name: '待处理' },
  { id: 'tag-gift', name: '礼物' },
  { id: 'tag-fragile', name: '易碎' },
];

export const DEFAULT_ROOM_TYPES = [
  { id: 'rt-bedroom', name: '卧室' }, { id: 'rt-living', name: '客厅' },
  { id: 'rt-kitchen', name: '厨房' }, { id: 'rt-bathroom', name: '卫生间' },
  { id: 'rt-balcony', name: '阳台' }, { id: 'rt-study', name: '书房' },
  { id: 'rt-storage', name: '储物间' },
];

export const DEFAULT_CONTAINER_TYPES = [
  { id: 'ct-wardrobe', name: '衣柜' }, { id: 'ct-cabinet', name: '橱柜' },
  { id: 'ct-drawer', name: '抽屉柜' }, { id: 'ct-bookshelf', name: '书架' },
  { id: 'ct-shoe', name: '鞋柜' }, { id: 'ct-utility', name: '杂物柜' },
];
