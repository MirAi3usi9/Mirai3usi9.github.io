(function () {
  'use strict';

  const { createApp, ref, reactive, computed, toRaw, nextTick, onMounted, onUnmounted, watch } = Vue;

  // ==================== XOR 工具 ====================
  const CRED_TOKEN = 'DxAWNxxXPz4eGTcgIRk0UCgKWj4zDxQVDxpTWAtWPS08XUovEj1RCw==';
  const CRED_REPO  = 'JREUKRFVHQsPUVcrAQoHAUsTGxFfRh8PHBATClYPBw==';

  function xorEncode(str, key) {
    const keyBytes = new TextEncoder().encode(key);
    const strBytes = new TextEncoder().encode(str);
    const result = new Uint8Array(strBytes.length);
    for (let i = 0; i < strBytes.length; i++) result[i] = strBytes[i] ^ keyBytes[i % keyBytes.length];
    let binary = '';
    for (let i = 0; i < result.length; i++) binary += String.fromCharCode(result[i]);
    return btoa(binary);
  }

  function xorDecode(encoded, key) {
    const binary = atob(encoded);
    const keyBytes = new TextEncoder().encode(key);
    const result = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i) ^ keyBytes[i % keyBytes.length];
    return new TextDecoder().decode(result);
  }

  // ==================== 配置 ====================
  const DATA_VERSION = 1; // ★ 每次存储结构变更（新增字段/表）时 +1，保证旧缓存自动重置

  const PRESETS = {
    roomType: ['卧室', '客厅', '厨房', '卫生间', '阳台', '书房', '储物间'],
    containerType: ['衣柜', '橱柜', '抽屉柜', '书架', '鞋柜', '杂物柜'],
    boxColors: ['#FFB7C5', '#FF9EB5', '#FFC2D1', '#FF85A2', '#FF6B9D', '#FFA6C9', '#F4A6CD', '#F7B7D3', '#F8C8DC'],
  };

  const DEFAULT_CATEGORIES = [
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

  const DEFAULT_TAGS = [
    { id: 'tag-common', name: '常用' },
    { id: 'tag-seasonal', name: '季节' },
    { id: 'tag-backup', name: '备用' },
    { id: 'tag-important', name: '重要' },
    { id: 'tag-todo', name: '待处理' },
    { id: 'tag-gift', name: '礼物' },
    { id: 'tag-fragile', name: '易碎' },
  ];
  const DEFAULT_ROOM_TYPES = [
    { id: 'rt-bedroom', name: '卧室' }, { id: 'rt-living', name: '客厅' },
    { id: 'rt-kitchen', name: '厨房' }, { id: 'rt-bathroom', name: '卫生间' },
    { id: 'rt-balcony', name: '阳台' }, { id: 'rt-study', name: '书房' },
    { id: 'rt-storage', name: '储物间' },
  ];
  const DEFAULT_CONTAINER_TYPES = [
    { id: 'ct-wardrobe', name: '衣柜' }, { id: 'ct-cabinet', name: '橱柜' },
    { id: 'ct-drawer', name: '抽屉柜' }, { id: 'ct-bookshelf', name: '书架' },
    { id: 'ct-shoe', name: '鞋柜' }, { id: 'ct-utility', name: '杂物柜' },
  ];

  // ==================== 通用工具 ====================
  function genId() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 8); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function formatTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function isMobile() { return window.innerWidth < 768; }

  function getIcon(type) {
    const icons = { house: '🏠', room: '🚪', container: '🗄️', box: '📦', item: '🏷️' };
    return icons[type] || '📋';
  }

  function getEntityTypeName(type) {
    const names = { house: '小窝', room: '房间', container: '柜子', box: '盒子', item: '物品' };
    return names[type] || '';
  }

  const CHILD_KEYS = {
    house: ['rooms'],
    room: ['containers', 'boxes', 'items'],
    container: ['boxes', 'items'],
    box: ['boxes', 'items'],
  };
  function keyToType(key) {
    return key === 'rooms' ? 'room' : key === 'containers' ? 'container' : key === 'boxes' ? 'box' : 'item';
  }
  function childKeyFor(childType) {
    return childType === 'room' ? 'rooms' : childType === 'container' ? 'containers' : childType === 'box' ? 'boxes' : 'items';
  }
  function findEntityParent(entity, type) {
    if (type === 'house') {
      const idx = store.houses.findIndex(h => h.id === entity.id);
      return idx !== -1 ? { parent: store, array: store.houses, index: idx } : null;
    }
    for (const house of store.houses) {
      const result = searchChildren(entity, type, house, 'house');
      if (result) return result;
    }
    return null;
  }
  function searchChildren(entity, type, parent, parentType) {
    const keys = CHILD_KEYS[parentType] || [];
    for (const key of keys) {
      const arr = parent[key] || [];
      if (childKeyFor(type) === key) {
        const idx = arr.findIndex(child => child.id === entity.id);
        if (idx !== -1) return { parent, array: arr, index: idx };
      }
      for (const child of arr) {
        const childType = keyToType(key);
        const result = searchChildren(entity, type, child, childType);
        if (result) return result;
      }
    }
    return null;
  }
  function canContain(parentType, childType) {
    if (childType === 'house') return false;
    if (childType === 'room') return parentType === 'house';
    if (childType === 'container') return parentType === 'room';
    if (childType === 'box') return ['room', 'container', 'box'].includes(parentType);
    if (childType === 'item') return ['room', 'container', 'box'].includes(parentType);
    return false;
  }
  function moveEntityUp(entity, type) {
    const info = findEntityParent(entity, type);
    if (!info || info.index <= 0) return;
    const arr = info.array;
    if (info.index > 0) { [arr[info.index - 1], arr[info.index]] = [arr[info.index], arr[info.index - 1]]; }
  }
  function moveEntityDown(entity, type) {
    const info = findEntityParent(entity, type);
    if (!info || info.index >= info.array.length - 1) return;
    const arr = info.array;
    [arr[info.index + 1], arr[info.index]] = [arr[info.index], arr[info.index + 1]];
  }
  function cloneEntity(entity, type) {
    const clone = JSON.parse(JSON.stringify(entity));
    function renewIds(obj, t) { obj.id = genId(); (CHILD_KEYS[t] || []).forEach(k => (obj[k] || []).forEach(c => renewIds(c, keyToType(k)))); }
    renewIds(clone, type);
    return clone;
  }
  function copyEntity(entity, type) {
    const info = findEntityParent(entity, type);
    if (!info) return null;
    const clone = cloneEntity(entity, type);
    info.array.splice(info.index + 1, 0, clone);
    return clone;
  }

  function getTypeLabel(entity, type) {
    if (type === 'house') return '小窝';
    if (type === 'room' || type === 'container') return entity.type || '';
    if (type === 'box') return entity.color ? '🎨' : '';
    if (type === 'item') return entity.category || '';
    return '';
  }

  function ensureArray(obj, key) { if (!obj[key]) obj[key] = []; }

  function getChildren(entity, type) {
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

  function removeFromArray(arr, id) {
    if (!arr) return false;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { arr.splice(i, 1); return true; }
    }
    return false;
  }

  function compressImageToWebP(file, maxWidth = 900, quality = 0.75) {
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

  // ==================== STORE ====================
  // ★ 新增字段/表时：1) 在 store 中加入字段  2) 在 fetchLocalStorage/saveToLocalStorage/markDirty 中读写
  //   3) 更新 DATA_VERSION  4) clearLocalData 已按前缀自动匹配，无需修改
  const store = reactive({
    loggedIn: false,
    githubToken: '',
    githubRepo: '',
    houses: [],
    categories: [],
    tags: [],
    roomTypes: [],
    containerTypes: [],
    // ★ 家族数据独立存储（见 "家人们 | 独立存储"），不在此处同步
    familyMembers: [],
    loading: false,
    lastError: '',
    dirty: false,
    familyDirty: false,
    useGitHub: false,
    lastSync: null,
    syncError: '',
  });

  function collectExistingCategories() {
    const set = new Set();
    function scan(entity, type) {
      if (type === 'item' && entity.category) set.add(entity.category);
      getChildren(entity, type).forEach(ch => scan(ch.entity, ch.type));
    }
    store.houses.forEach(h => scan(h, 'house'));
    return Array.from(set).map(name => ({ id: genId(), name }));
  }

  function collectExistingTags() {
    const set = new Set();
    function scan(entity, type) {
      if (entity.tags) entity.tags.forEach(t => set.add(t));
      getChildren(entity, type).forEach(ch => scan(ch.entity, ch.type));
    }
    store.houses.forEach(h => scan(h, 'house'));
    return Array.from(set).map(name => ({ id: genId(), name }));
  }

  function initDefaults() {
    if (!store.categories || store.categories.length === 0) store.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
    if (!store.tags || store.tags.length === 0) store.tags = DEFAULT_TAGS.map(t => ({ ...t }));
    if (!store.roomTypes || store.roomTypes.length === 0) store.roomTypes = DEFAULT_ROOM_TYPES.map(r => ({ ...r }));
    if (!store.containerTypes || store.containerTypes.length === 0) store.containerTypes = DEFAULT_CONTAINER_TYPES.map(c => ({ ...c }));
    collectExistingCategories().forEach(c => { if (!store.categories.find(x => x.name === c.name)) store.categories.push(c); });
    collectExistingTags().forEach(t => { if (!store.tags.find(x => x.name === t.name)) store.tags.push(t); });
  }

  // ==================== GITHUB API ====================
  function ghHeaders() {
    return { 'Authorization': 'Bearer ' + store.githubToken, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'xiaohua-xiaofeng-browser' };
  }
  function ghUrl() { return 'https://api.github.com/repos/' + store.githubRepo + '/contents/data/inventory.json'; }

  function isLocalMode() {
    return window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }
  function isOnlineSyncEnabled() {
    if (!store.githubToken || !store.githubRepo) return false;
    if (isLocalMode()) return store.useGitHub;
    return true;
  }
  function loadUseGitHubSetting() {
    const v = localStorage.getItem('xiaohua_xiaofeng_use_github');
    store.useGitHub = v === 'true';
  }
  function saveUseGitHubSetting() {
    localStorage.setItem('xiaohua_xiaofeng_use_github', store.useGitHub ? 'true' : 'false');
  }

  async function fetchData() {
    fetchLocalStorage();
    store.dirty = localStorage.getItem('xiaohua_xiaofeng_dirty') === 'true';
    if (!isOnlineSyncEnabled() || store.dirty) return;
    store.loading = true; store.lastError = ''; store.syncError = '';
    try {
      const resp = await fetch(ghUrl(), { headers: ghHeaders() });
      if (resp.status === 404) { return; }
      if (resp.status === 401 || resp.status === 403) throw new Error('GitHub Token 无效或权限不足 (' + resp.status + ')');
      if (!resp.ok) throw new Error('GitHub API 响应 ' + resp.status);
      const data = await resp.json();
      if (!data.content) { return; }
      const innerBase64 = atob(data.content.trim());
      const jsonStr = xorDecode(innerBase64, 'hxf');
      const parsed = JSON.parse(jsonStr);
      store.houses = parsed.houses || [];
      store.categories = parsed.categories || [];
      store.tags = parsed.tags || [];
      store.roomTypes = parsed.roomTypes || [];
      store.containerTypes = parsed.containerTypes || [];
      initDefaults();
      store.lastSync = Date.now();
      store._lastSha = data.sha;
      localStorage.setItem('xiaohua_xiaofeng_data', JSON.stringify({ houses: toRaw(store.houses), categories: toRaw(store.categories), tags: toRaw(store.tags) }));
      ElementPlus.ElMessage.success('已从 GitHub 加载到本地');
    } catch (e) {
      store.syncError = '拉取失败: ' + e.message;
      store.lastError = e.message;
      ElementPlus.ElMessage.error('GitHub 拉取失败: ' + e.message);
    } finally { store.loading = false; }
  }

  async function syncToGitHub() {
    if (!store.dirty) return;
    if (!isOnlineSyncEnabled()) { saveToLocalStorage(); store.dirty = false; return; }
    store.loading = true; store.lastError = ''; store.syncError = '';
    try {
      const jsonStr = JSON.stringify({ houses: toRaw(store.houses), categories: toRaw(store.categories), tags: toRaw(store.tags), roomTypes: toRaw(store.roomTypes), containerTypes: toRaw(store.containerTypes) });
      const innerBase64 = xorEncode(jsonStr, 'hxf');
      const fileContent = btoa(innerBase64);
      const getResp = await fetch(ghUrl(), { headers: ghHeaders() });
      let sha = null;
      if (getResp.ok) { const current = await getResp.json(); sha = current.sha; }
      const putBody = { message: '更新收纳数据', content: fileContent };
      if (sha) putBody.sha = sha;
      const putResp = await fetch(ghUrl(), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(putBody) });
      if (!putResp.ok) { const errData = await putResp.json(); throw new Error(errData.message || 'HTTP ' + putResp.status); }
      store.dirty = false;
      store.lastSync = Date.now();
      localStorage.setItem('xiaohua_xiaofeng_data', JSON.stringify({ houses: toRaw(store.houses), categories: toRaw(store.categories), tags: toRaw(store.tags) }));
      localStorage.removeItem('xiaohua_xiaofeng_dirty');
      ElementPlus.ElMessage.success('已同步到 GitHub');
    } catch (e) {
      store.syncError = '同步失败: ' + e.message;
      store.lastError = '保存失败: ' + e.message;
      ElementPlus.ElMessage.error(store.lastError);
    } finally { store.loading = false; }
  }

  async function saveToGitHub() {
    await syncToGitHub();
  }

  async function clearGitHubFile() {
    if (!store.githubToken || !store.githubRepo) { ElementPlus.ElMessage.warning('未配置 GitHub'); return; }
    store.loading = true; store.lastError = ''; store.syncError = '';
    try {
      const getResp = await fetch(ghUrl(), { headers: ghHeaders() });
      if (!getResp.ok) throw new Error('获取文件信息失败 ' + getResp.status);
      const current = await getResp.json();
      const delResp = await fetch(ghUrl(), { method: 'DELETE', headers: ghHeaders(), body: JSON.stringify({ message: '清空收纳数据', sha: current.sha }) });
      if (!delResp.ok) throw new Error('删除失败 ' + delResp.status);
      resetData();
      store.dirty = false;
      store.lastSync = Date.now();
      saveToLocalStorage();
      ElementPlus.ElMessage.success('已清空 GitHub 数据');
    } catch (e) {
      store.syncError = '清空失败: ' + e.message;
      store.lastError = '清空失败: ' + e.message;
      ElementPlus.ElMessage.error(store.lastError);
    } finally { store.loading = false; }
  }

  function resetData() { store.houses = []; store.categories = []; store.tags = []; store.roomTypes = []; store.containerTypes = []; initDefaults(); }

  // ★ 新增存储字段/表时: 1) 更新 DATA_VERSION  2) 在 resetData / saveToLocalStorage / markDirty 中加入新字段
  function fetchLocalStorage() {
    var ver = localStorage.getItem('xiaohua_xiaofeng_version');
    if (ver !== String(DATA_VERSION)) {
      // 版本不匹配 → 清理旧缓存，使用默认数据
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('xiaohua_xiaofeng_') === 0) localStorage.removeItem(k);
      }
      localStorage.setItem('xiaohua_xiaofeng_version', String(DATA_VERSION));
      resetData();
      return;
    }
    var data = localStorage.getItem('xiaohua_xiaofeng_data');
    if (data) {
      try {
        var parsed = JSON.parse(data);
        store.houses = parsed.houses || [];
        store.categories = parsed.categories || [];
        store.tags = parsed.tags || [];
        store.roomTypes = parsed.roomTypes || [];
        store.containerTypes = parsed.containerTypes || [];
      } catch (e) { resetData(); }
    } else { resetData(); }
    initDefaults();
  }
  function saveToLocalStorage() {
    localStorage.setItem('xiaohua_xiaofeng_version', String(DATA_VERSION));
    localStorage.setItem('xiaohua_xiaofeng_data', JSON.stringify({ houses: toRaw(store.houses), categories: toRaw(store.categories), tags: toRaw(store.tags), roomTypes: toRaw(store.roomTypes), containerTypes: toRaw(store.containerTypes) }));
    store.dirty = false;
    store.lastSync = Date.now();
    localStorage.removeItem('xiaohua_xiaofeng_dirty');
    ElementPlus.ElMessage.success('已保存到本地');
  }
  function markDirty() {
    store.dirty = true;
    store.syncError = '';
    localStorage.setItem('xiaohua_xiaofeng_version', String(DATA_VERSION));
    localStorage.setItem('xiaohua_xiaofeng_dirty', 'true');
    localStorage.setItem('xiaohua_xiaofeng_data', JSON.stringify({ houses: toRaw(store.houses), categories: toRaw(store.categories), tags: toRaw(store.tags), roomTypes: toRaw(store.roomTypes), containerTypes: toRaw(store.containerTypes) }));
  }

  // ==================== 家人们 | 独立存储（新增表时同步修改 clearLocalData 注释以外的清理逻辑会自动按前缀匹配） ====================
  function ghFamilyUrl() { return 'https://api.github.com/repos/' + store.githubRepo + '/contents/data/family.json'; }
  function fetchFamilyLocalStorage() {
    var d = localStorage.getItem('xiaohua_xiaofeng_family_data');
    try { store.familyMembers = d ? JSON.parse(d) : []; } catch(e) { store.familyMembers = []; }
  }
  function saveFamilyToLocalStorage() {
    localStorage.setItem('xiaohua_xiaofeng_version', String(DATA_VERSION));
    localStorage.setItem('xiaohua_xiaofeng_family_data', JSON.stringify(toRaw(store.familyMembers)));
    store.familyDirty = false;
    store.lastSync = Date.now();
    localStorage.removeItem('xiaohua_xiaofeng_family_dirty');
  }
  function markFamilyDirty() {
    store.familyDirty = true;
    localStorage.setItem('xiaohua_xiaofeng_version', String(DATA_VERSION));
    localStorage.setItem('xiaohua_xiaofeng_family_dirty', 'true');
    localStorage.setItem('xiaohua_xiaofeng_family_data', JSON.stringify(toRaw(store.familyMembers)));
  }
  async function fetchFamilyData() {
    fetchFamilyLocalStorage();
    store.familyDirty = localStorage.getItem('xiaohua_xiaofeng_family_dirty') === 'true';
    if (!isOnlineSyncEnabled() || store.familyDirty) return;
    try {
      var resp = await fetch(ghFamilyUrl(), { headers: ghHeaders() });
      if (!resp.ok) return;
      var data = await resp.json();
      if (!data.content) return;
      var str = xorDecode(atob(data.content.trim()), 'hxf');
      store.familyMembers = JSON.parse(str) || [];
      store.lastSync = Date.now();
      saveFamilyToLocalStorage();
    } catch(e) { store.lastError = '家人们拉取失败: ' + e.message; }
  }
  async function syncFamilyToGitHub() {
    if (!store.familyDirty) return;
    if (!isOnlineSyncEnabled()) { saveFamilyToLocalStorage(); return; }
    store.loading = true;
    try {
      var json = JSON.stringify(toRaw(store.familyMembers));
      var content = btoa(xorEncode(json, 'hxf'));
      var getResp = await fetch(ghFamilyUrl(), { headers: ghHeaders() });
      var sha = null;
      if (getResp.ok) { sha = (await getResp.json()).sha; }
      var body = { message: '更新家庭关系数据', content: content };
      if (sha) body.sha = sha;
      var putResp = await fetch(ghFamilyUrl(), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
      if (!putResp.ok) throw new Error('HTTP ' + putResp.status);
      store.familyDirty = false; store.lastSync = Date.now();
      saveFamilyToLocalStorage();
    } catch(e) { store.lastError = '家人们同步失败: ' + e.message; ElementPlus.ElMessage.error(store.lastError); }
    finally { store.loading = false; }
  }

  // ==================== 登录 ====================
  const LoginGate = {
    template: `
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-avatar">🌸</div>
          <h1>小花与小风</h1>
          <p class="login-subtitle">输入「小秘密」，点击「开门！」</p>
          <el-input v-model="password" type="password" placeholder="小秘密" show-password @keyup.enter="login" size="large" />
          <el-button type="primary" style="width:100%;margin-top:16px;font-size:16px;font-weight:600;" @click="login" :loading="logging" size="large">🚪 开门！</el-button>
          <p v-if="error" style="color:#f56c6c;margin-top:12px;font-size:13px;">{{ error }}</p>
          <p style="margin-top:20px;font-size:12px;color:#c48a9c;border-top:1px solid #ffd6e0;padding-top:14px;">
            <a href="#" @click.prevent="clearLocalData" style="color:#f56c6c;text-decoration:underline;">⚠️ 清除本地缓存</a>
            （页面加载异常时使用）
          </p>
      </div>
    `,
    setup() {
      const password = ref('');
      const logging = ref(false);
      const error = ref('');
      function login() {
        if (!password.value) { error.value = '请输入小秘密'; return; }
        logging.value = true;
        try {
          const decodedToken = xorDecode(CRED_TOKEN, password.value);
          const decodedRepo = xorDecode(CRED_REPO, password.value);
          if (decodedRepo.indexOf('/') < 0) { error.value = '小秘密不对哦~'; logging.value = false; return; }
          store.githubToken = decodedToken;
          store.githubRepo = decodedRepo;
          localStorage.setItem('xiaohua_xiaofeng_logged_in', 'true');
          loadUseGitHubSetting();
          store.loggedIn = true;
        } catch (e) { error.value = '小秘密不对哦~'; logging.value = false; }
      }
      function clearLocalData() {
        // ★ 遍历清除所有本应用 localStorage 缓存（前缀匹配），新增存储 key 时无需修改此处
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (key && key.indexOf('xiaohua_xiaofeng_') === 0) keysToRemove.push(key);
        }
        keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
        ElementPlus.ElMessage.success('缓存已清除，即将强制刷新');
        // 添加时间戳参数强制浏览器重新请求所有资源（CSS / JS / HTML），不使用 HTTP 缓存
        setTimeout(function() { location.href = location.href.split('?')[0] + '?_cache=' + Date.now(); }, 1000);
      }
      return { password, logging, error, login, clearLocalData };
    },
  };

  // ==================== 标签输入组件 ====================
  const TagInput = {
    name: 'TagInput',
    props: { modelValue: { type: Array, default: () => [] } },
    emits: ['update:modelValue'],
    template: `
      <div>
        <div class="tag-chips">
          <span class="tag-chip" v-for="(tag, idx) in localTags" :key="idx">{{ tag }}<span class="tag-chip-close" @click="removeTag(idx)">×</span></span>
        </div>
        <el-input v-model="inputVal" placeholder="输入标签后回车" size="small" @keyup.enter="addTag" style="width:160px;" />
        <div class="tag-suggestions" v-if="suggestions.length">
          <span class="tag-suggestion" v-for="tag in suggestions" :key="tag.id" @click="addTagByName(tag.name)">+ {{ tag.name }}</span>
        </div>
      </div>
    `,
    data() { return { inputVal: '', localTags: this.modelValue ? this.modelValue.slice() : [] }; },
    watch: { modelValue(v) { this.localTags = v ? v.slice() : []; } },
    computed: {
      suggestions() {
        if (!store.tags) return [];
        return store.tags.filter(t => this.localTags.indexOf(t.name) === -1);
      },
    },
    methods: {
      addTag() {
        const v = this.inputVal.trim();
        if (v) this.addTagByName(v);
      },
      addTagByName(v) {
        if (this.localTags.indexOf(v) === -1) {
          this.localTags.push(v); this.inputVal = ''; this.$emit('update:modelValue', this.localTags.slice());
        }
        if (store.tags && !store.tags.find(t => t.name === v)) {
          store.tags.push({ id: genId(), name: v });
        }
      },
      removeTag(idx) { this.localTags.splice(idx, 1); this.$emit('update:modelValue', this.localTags.slice()); },
    },
  };

  // ==================== 图片上传组件 ====================
  const ImageUpload = {
    name: 'ImageUpload',
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    template: `
      <div class="img-upload">
        <div class="img-actions">
          <el-upload accept="image/*" :auto-upload="false" :show-file-list="false" @change="onFileChange">
            <el-button size="small" type="primary" :loading="compressing">选择图片并压缩为 WebP</el-button>
          </el-upload>
          <el-button v-if="localImage" size="small" @click="clear">清除图片</el-button>
        </div>
        <img v-if="localImage" :src="localImage" class="img-preview" />
        <el-input v-if="localImage" v-model="localImage" type="textarea" :rows="2" placeholder="WebP base64..." size="small" style="margin-top:4px;" @change="$emit('update:modelValue', localImage)" />
      </div>
    `,
    data() { return { localImage: this.modelValue || '', compressing: false }; },
    watch: { modelValue(v) { this.localImage = v || ''; } },
    methods: {
      async onFileChange(file) {
        const raw = file.raw;
        if (!raw) return;
        this.compressing = true;
        try {
          const dataUrl = await compressImageToWebP(raw);
          this.localImage = dataUrl;
          this.$emit('update:modelValue', dataUrl);
        } catch (e) {
          ElementPlus.ElMessage.error(e.message || '图片处理失败');
        } finally { this.compressing = false; }
      },
      clear() { this.localImage = ''; this.$emit('update:modelValue', ''); },
    },
  };

  // ==================== 列表管理组件 ====================
  const ListManager = {
    name: 'ListManager',
    props: { title: String, items: Array, icon: String },
    emits: ['add', 'update', 'delete'],
    template: `
      <div class="list-manager">
        <div class="list-add">
          <el-input v-model="newName" :placeholder="'新' + title" @keyup.enter="add" size="default" />
          <el-button type="primary" size="default" @click="add">添加</el-button>
        </div>
        <div class="list-items">
          <div v-for="item in items" :key="item.id" class="list-item">
            <span v-if="editingId !== item.id" class="list-item-name">{{ item.name }}</span>
            <el-input v-else v-model="editName" size="small" @keyup.enter="saveEdit(item)" />
            <div class="list-item-actions">
              <button v-if="editingId !== item.id" class="ec-act" @click="startEdit(item)" title="编辑">✏️</button>
              <button v-else class="ec-act" @click="saveEdit(item)" title="保存">✓</button>
              <button class="ec-act danger" @click="$emit('delete', item)" title="删除">✖️</button>
            </div>
          </div>
        </div>
      </div>
    `,
    data() { return { newName: '', editingId: null, editName: '' }; },
    methods: {
      add() { const v = this.newName.trim(); if (!v) return; this.$emit('add', v); this.newName = ''; },
      startEdit(item) { this.editingId = item.id; this.editName = item.name; },
      saveEdit(item) { const v = this.editName.trim(); if (!v) return; this.$emit('update', item, v); this.editingId = null; this.editName = ''; },
    },
  };

  // ==================== 递归卡片组件 ====================
  const CardNode = {
    name: 'CardNode',
    props: { entity: Object, type: String, expandedIds: Object, isRoot: { type: Boolean, default: false }, isMobileView: { type: Boolean, default: false } },
    emits: ['toggle', 'expand-all', 'toggle-expand-all', 'add-room', 'add-container', 'add-box', 'add-item', 'edit', 'delete', 'copy'],
    template: `
      <li class="card-tree-node" :class="{ 'card-tree-root': isRoot }">
        <div class="entity-card" :class="[type, { expanded: isExpanded }]" :id="'card-' + entity.id" v-long-press="() => openMoveDialog(entity, type)" @click.stop="onCardClick">
          <div class="ec-top">
            <div class="ec-icon">{{ icon }}</div>
            <div class="ec-title">
              <div class="ec-name-row">
                <span class="ec-name">{{ entity.name }}</span>
                <span v-if="type==='box' && entity.color" class="ec-color-dot" :style="{background: entity.color}"></span>
              </div>
              <el-tag v-if="typeLabel" size="small" class="ec-type-tag" :type="tagType">{{ typeLabel }}</el-tag>
            </div>
          </div>
          <div class="ec-tags" v-if="entity.tags && entity.tags.length">
            <span class="ec-tag-chip" v-for="tag in visibleTags" :key="tag">#{{ tag }}</span>
            <span v-if="entity.tags.length > 3" class="ec-more">+{{ entity.tags.length - 3 }}</span>
          </div>
          <div class="ec-remark" :title="entity.remark" v-if="entity.remark">{{ entity.remark }}</div>
          <div class="ec-img" v-if="entity.image" @click.stop="previewImage(entity.image)"><img :src="entity.image" class="ec-thumb" title="点击查看原图" /></div>
          <div class="ec-actions">
            <button class="ec-act" @click.stop="$emit('edit', entity, type)" title="编辑">✏️ 编辑</button>
          </div>
          <div class="children-preview" v-if="childNodes.length">
            <div class="preview-title">下级列表（{{ childNodes.length }}）</div>
            <div class="preview-list">
              <div class="preview-item" v-for="child in previewChildren" :key="child.entity.id">
                <span>{{ getIcon(child.type) }}</span>
                <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ child.entity.name }}</span>
                <el-tag size="small" :type="child.type==='house'?'warning':child.type==='room'?'':child.type==='container'?'success':child.type==='box'?'info':'danger'">{{ getEntityTypeName(child.type) }}</el-tag>
              </div>
              <div v-if="childNodes.length > previewLimit" class="preview-more">还有 {{ childNodes.length - previewLimit }} 个...</div>
            </div>
          </div>
        </div>
        <ul class="tree-children" v-if="type !== 'item' && isExpanded" :class="{ empty: !childNodes.length }">
          <card-node v-for="child in childNodes" :key="child.entity.id" :entity="child.entity" :type="child.type" :expanded-ids="expandedIds" :is-root="false" :is-mobile-view="isMobileView"
            @toggle="$emit('toggle', $event)"
            @expand-all="(e,t) => $emit('expand-all', e, t)"
            @toggle-expand-all="(e,t) => $emit('toggle-expand-all', e, t)"
            @add-room="$emit('add-room', $event)"
            @add-container="$emit('add-container', $event)"
            @add-box="$emit('add-box', $event)"
            @add-item="$emit('add-item', $event)"
            @edit="(e,t) => $emit('edit', e, t)"
            @delete="(e,t) => $emit('delete', e, t)"
            @copy="(e,t) => $emit('copy', e, t)" />
          <li class="card-tree-node">
            <div class="entity-card quick-add-card">
              <div class="quick-add-content">
                <button v-if="type==='house'" class="ec-act" @click.stop="$emit('add-room', entity)" title="添加房间">+🚪</button>
                <button v-if="type==='room'" class="ec-act" @click.stop="$emit('add-container', entity)" title="添加柜子">+🗄️</button>
                <button v-if="type==='room'||type==='container'||type==='box'" class="ec-act" @click.stop="$emit('add-box', entity)" title="添加盒子">+📦</button>
                <button v-if="type==='room'||type==='container'||type==='box'" class="ec-act" @click.stop="$emit('add-item', entity)" title="添加物品">+🏷️</button>
              </div>
            </div>
          </li>
        </ul>
      </li>
    `,
    setup(props, { emit }) {
      const icon = computed(() => getIcon(props.type));
      const typeLabel = computed(() => getTypeLabel(props.entity, props.type));
      const isExpanded = computed(() => props.expandedIds.has(props.entity.id));
      const childNodes = computed(() => getChildren(props.entity, props.type));
      const tagType = computed(() => {
        const map = { house: 'warning', room: '', container: 'success', box: 'info', item: 'danger' };
        return map[props.type];
      });
      const visibleTags = computed(() => (props.entity.tags || []).slice(0, 3));
      const previewLimit = 8;
      const previewChildren = computed(() => childNodes.value.slice(0, previewLimit));
      function previewImage(src) { window.open(src, '_blank'); }
      function onToggle() { emit('toggle', props.entity.id); }
      function onCardClick() {
        if (props.type === 'house') emit('toggle-expand-all', props.entity, props.type);
        else if (props.type !== 'item') onToggle();
      }
      function onAction(cmd) {
        if (cmd === 'add-room') emit('add-room', props.entity);
        else if (cmd === 'add-container') emit('add-container', props.entity);
        else if (cmd === 'add-box') emit('add-box', props.entity);
        else if (cmd === 'add-item') emit('add-item', props.entity);
        else if (cmd === 'copy') emit('copy', props.entity, props.type);
        else if (cmd === 'edit') emit('edit', props.entity, props.type);
        else if (cmd === 'delete') emit('delete', props.entity, props.type);
      }
      return { icon, typeLabel, isExpanded, childNodes, tagType, visibleTags, previewLimit, previewChildren, onToggle, onCardClick, onAction, previewImage, getIcon, getEntityTypeName };
    },
  };

  // ==================== 主应用 ====================
  const MainApp = {
    components: { CardNode, TagInput, ImageUpload, ListManager },
    template: `
      <div>
        <!-- 主菜单 -->
        <div v-if="!currentFeature" class="menu-page">
          <div class="menu-header">
            <div class="menu-avatar">🌸</div>
            <h1>小花与小风</h1>
            <p class="menu-subtitle">管家·花小风</p>
          </div>
          <div class="menu-grid">
            <div class="menu-card" @click="enterFeature('storage')">
              <div class="menu-card-icon">🏠</div>
              <div style="flex:1"><div class="menu-card-title">我们的家</div><div class="menu-card-desc">翻箱倒柜攻略~</div></div>
            </div>
            <div class="menu-card" @click="enterFeature('family')">
              <div class="menu-card-icon">👨‍👩‍👧‍👦</div>
              <div style="flex:1"><div class="menu-card-title">我们的家人们</div><div class="menu-card-desc">常言道：陈林半天下~</div></div>
            </div>
          </div>
          <div class="menu-footer">
            <el-button text size="large" @click="logout" style="font-size:16px;color:#fff;">👋 退~退~退~</el-button>
          </div>
        </div>

        <!-- 收纳管理 -->
        <div v-else-if="currentFeature === 'storage'" class="storage-page blueprint-bg">
          <div class="s-header">
            <button class="s-back" @click="currentFeature = null" title="返回主菜单">←</button>
            <span class="s-header-title">我们的家</span>
            <div class="s-header-right">
              <span class="sync-status" :title="syncStatusText">{{ syncStatusText }}</span>
              <button class="s-header-btn" @click="manualSync" title="保存同步">💾</button>
              <button class="s-header-btn" @click="refreshFromGitHub" title="从 GitHub 加载最新数据">📥</button>
              <button class="s-header-btn" :class="{active: isOnlineSyncEnabled()}" @click="toggleUseGitHub" :title="isOnlineSyncEnabled() ? '已开启 GitHub 同步' : '已关闭 GitHub 同步'">☁️</button>
              <button class="s-header-btn danger" @click="showClearDialog" title="清空 GitHub 数据">🗑️</button>
              <button class="s-header-btn" :class="{active: searchVisible}" @click="toggleSearch" title="搜索">🔍</button>
              <button class="s-header-btn" @click="showMobileTree = true" v-if="isMobileView" title="目录树">☰</button>
              <button class="s-header-btn" :class="{active: !sidebarCollapsed}" @click="sidebarCollapsed = !sidebarCollapsed" v-else title="目录树">☰</button>
            </div>
          </div>

          <div v-if="searchVisible" class="search-bar">
            <el-input v-model="searchQuery" placeholder="搜索名称、备注..." size="small" clearable @keyup.enter="doSearch" />
            <el-button size="small" type="primary" @click="doSearch">搜索</el-button>
            <el-button size="small" @click="closeSearch">关闭</el-button>
          </div>

          <div class="s-body">
            <div v-if="!isMobileView && !sidebarCollapsed" class="sidebar">
              <div class="sidebar-section sidebar-mgmt">
                <div class="sidebar-header">
                  <span>管理工具</span>
                  <el-dropdown trigger="click" @command="showManageDialog">
                    <button class="el-button el-button--small el-button--primary" style="padding:4px 8px;font-size:13px;">📋 管理</button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="category">🏷️ 物品类别</el-dropdown-item>
                        <el-dropdown-item command="tag">🔖 标签</el-dropdown-item>
                        <el-dropdown-item command="roomType">🚪 房间类型</el-dropdown-item>
                        <el-dropdown-item command="containerType">🗄️ 柜子类型</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
              <div class="sidebar-section sidebar-tree-area">
                <div class="sidebar-header"><span>收纳结构</span><el-button size="small" type="primary" @click="showAddHouse">+小窝</el-button></div>
                <el-tree ref="desktopTreeRef" :data="treeData" node-key="id" :props="{ children: 'children', label: 'label' }" :default-expanded-keys="allExpandedKeys" @node-click="onTreeNodeClick" draggable :allow-drag="allowTreeDrag" :allow-drop="allowTreeDrop" @node-drop="handleTreeDrop" v-loading="store.loading" highlight-current>
                  <template #default="{ data }">
                    <span class="tree-node" v-long-press="() => openMoveDialog(data.entity, data.type)">
                      <span class="tree-label">{{ data.label }}</span>
                      <button class="tree-act-btn" @click.stop="treeMoveUp(data)" title="上移">↑</button>
                      <button class="tree-act-btn" @click.stop="treeMoveDown(data)" title="下移">↓</button>
                      <el-dropdown trigger="click" @command="(cmd) => onTreeAction(data, cmd)">
                        <button class="tree-act-btn" @click.stop title="操作">⚙️</button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item command="copy">📋 复制</el-dropdown-item>
                            <el-dropdown-item v-if="data.type==='house'" command="add-room">+🚪 添加房间</el-dropdown-item>
                            <el-dropdown-item v-if="data.type==='room'" command="add-container">+🗄️ 添加柜子</el-dropdown-item>
                            <el-dropdown-item v-if="data.type==='room'||data.type==='container'||data.type==='box'" command="add-box">+📦 添加盒子</el-dropdown-item>
                            <el-dropdown-item v-if="data.type==='room'||data.type==='container'||data.type==='box'" command="add-item">+🏷️ 添加物品</el-dropdown-item>
                            <el-dropdown-item command="edit">✏️ 编辑</el-dropdown-item>
                            <el-dropdown-item command="delete" divided>✖️ 删除</el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </span>
                  </template>
                </el-tree>
              </div>
            </div>

            <div class="card-area" :class="spacingClass" ref="cardAreaRef" :style="{ '--zoom': zoom }">
              <div class="zoom-controls">
                <button class="zoom-btn" @click="zoomOut" title="缩小">−</button>
                <span class="zoom-level">{{ zoomPercent }}%</span>
                <button class="zoom-btn" @click="zoomIn" title="放大">+</button>
                <button class="zoom-btn" @click="zoomReset" title="重置">⟲</button>
                <button class="zoom-btn" @click="toggleSpacing" :title="compactMode ? '切换宽松间距' : '切换紧凑间距'">{{ compactMode ? '紧凑' : '宽松' }}</button>
              </div>
              <div class="zoom-container">
                <div v-if="showSearch" class="search-results">
                  <div v-if="searchResults.length===0" style="color:#c48a9c;text-align:center;padding:48px 16px;font-size:14px;">没有找到相关内容</div>
                  <div v-for="(r,idx) in searchResults" :key="idx" class="search-item" @click="navToSearchResult(r)">
                    <div class="search-name">{{ r.name }}</div>
                    <div class="search-path">{{ r.path }}</div>
                    <div class="search-meta">
                      <el-tag size="small" :type="r.type==='house'?'warning':r.type==='room'?'':r.type==='container'?'success':r.type==='box'?'info':'danger'">{{ getEntityTypeName(r.type) }}</el-tag>
                      <el-tag v-if="r.entity.category" size="small">{{ r.entity.category }}</el-tag>
                      <el-tag v-if="r.entity.type" size="small">{{ r.entity.type }}</el-tag>
                    </div>
                  </div>
                </div>
                <div v-else>
                  <div v-if="store.houses.length===0" class="card-area-empty">
                    <div style="font-size:52px;">🏠</div>
                    <p>还没有小窝，点击左侧「+小窝」开始吧</p>
                  </div>
                  <ul v-else class="card-tree">
                    <card-node v-for="house in store.houses" :key="house.id" :entity="house" type="house" :expanded-ids="expandedIds" :is-root="true" :is-mobile-view="isMobileView"
                      @toggle="toggleExpand"
                      @expand-all="expandAll"
                      @toggle-expand-all="toggleExpandAll"
                      @add-room="showAddRoomForHouse"
                      @add-container="showAddContainer"
                      @add-box="showAddBox"
                      @add-item="showAddItem"
                      @edit="editEntity"
                      @delete="deleteEntity"
                      @copy="copyFromCard" />
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <el-drawer v-model="showMobileTree" title="管理工具" size="75%" v-if="isMobileView">
            <div style="margin-bottom:12px;">
              <el-dropdown trigger="click" @command="(c) => { showManageDialog(c); showMobileTree=false; }">
                <el-button size="small" type="primary">📋 管理</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="category">🏷️ 物品类别</el-dropdown-item>
                    <el-dropdown-item command="tag">🔖 标签</el-dropdown-item>
                    <el-dropdown-item command="roomType">🚪 房间类型</el-dropdown-item>
                    <el-dropdown-item command="containerType">🗄️ 柜子类型</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div style="margin-bottom:12px;"><el-button size="small" type="primary" @click="showAddHouse(); showMobileTree=false;">+小窝</el-button></div>
            <el-tree ref="mobileTreeRef" :data="treeData" node-key="id" :props="{ children: 'children', label: 'label' }" :default-expanded-keys="allExpandedKeys" @node-click="onMobileTreeNodeClick" draggable :allow-drag="allowTreeDrag" :allow-drop="allowTreeDrop" @node-drop="handleTreeDrop">
              <template #default="{ data }">
                <span class="tree-node" v-long-press="() => openMoveDialog(data.entity, data.type)">
                  <span class="tree-label">{{ data.label }}</span>
                  <button class="tree-act-btn" @click.stop="treeMoveUp(data)" title="上移">↑</button>
                  <button class="tree-act-btn" @click.stop="treeMoveDown(data)" title="下移">↓</button>
                  <el-dropdown trigger="click" @command="(cmd) => { onTreeAction(data, cmd); showMobileTree=false; }">
                    <button class="tree-act-btn" @click.stop title="操作">⚙️</button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="copy">📋 复制</el-dropdown-item>
                        <el-dropdown-item v-if="data.type==='house'" command="add-room">+🚪 添加房间</el-dropdown-item>
                        <el-dropdown-item v-if="data.type==='room'" command="add-container">+🗄️ 添加柜子</el-dropdown-item>
                        <el-dropdown-item v-if="data.type==='room'||data.type==='container'||data.type==='box'" command="add-box">+📦 添加盒子</el-dropdown-item>
                        <el-dropdown-item v-if="data.type==='room'||data.type==='container'||data.type==='box'" command="add-item">+🏷️ 添加物品</el-dropdown-item>
                        <el-dropdown-item command="edit">✏️ 编辑</el-dropdown-item>
                        <el-dropdown-item command="delete" divided>✖️ 删除</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                  </span>
                </span>
              </template>
            </el-tree>
          </el-drawer>
        </div>

        <!-- 家人们 -->
        <div v-else-if="currentFeature === 'family'" class="family-page">
          <div class="s-header">
            <button class="s-back" @click="currentFeature = null" title="返回主菜单">←</button>
            <span class="s-header-title">我们的家人们</span>
            <div class="s-header-right">
              <button class="s-header-btn" @click="enterFamilyFeature" title="刷新">🔄</button>
              <button class="s-header-btn" @click="showFamilyAdd('')" title="添加成员">➕</button>
            </div>
          </div>
          <div class="family-body">
            <template v-if="store.familyMembers.length === 0">
              <div class="family-empty">
                <div style="font-size:56px;">👨‍👩‍👧‍👦</div>
                <p>还没有家族成员，点击右上角 ➕ 开始添加</p>
              </div>
            </template>
            <template v-else>
              <div class="family-canvas">
                <div class="family-gen" v-for="(gen, gi) in buildFamilyTree()" :key="gi">
                  <div class="gen-label">{{ ['祖辈','父母辈','我们','子女','孙辈'][gi] || '' }}</div>
                  <div class="gen-members">
                    <div class="fm-card" v-for="m in gen" :key="m.id" @click="showFamilyEdit(m)">
                      <div class="fm-avatar">{{ m.gender === 'female' ? '👩' : '👨' }}</div>
                      <div class="fm-name">{{ m.name }}</div>
                      <div class="fm-spouse" v-if="m.spouseId">
                        <span class="fm-spouse-label">配偶</span>
                        {{ (getFamilyById(m.spouseId) || {}).name || '?' }}
                      </div>
                      <div class="fm-actions">
                        <button class="fm-btn" @click.stop="showFamilyAdd(m.id)" title="添加子女">+👶</button>
                        <button class="fm-btn" @click.stop="showFamilyEdit(m)" title="编辑">✏️</button>
                        <button class="fm-btn danger" @click.stop="deleteFamilyMember(m)" title="删除">✖️</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- 调整归属弹窗 -->
        <el-dialog v-model="moveDialog.visible" title="调整归属" width="92%" :style="{maxWidth:'420px'}" :close-on-click-modal="false">
          <p style="margin-bottom:12px;color:#5a3a47;">将 <b>{{ getIcon(moveDialog.type) }} {{ moveDialog.entity?.name }}</b> 移动到：</p>
          <el-radio-group v-model="moveDialog.selectedParentId" style="display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto;">
            <el-radio v-for="c in moveDialog.candidates" :key="c.id" :label="c.id" style="align-items:flex-start;margin:0;">
              <span :style="{display:'inline-block',paddingLeft:(c.depth*16)+'px',maxWidth:'100%',overflowWrap:'break-word'}">{{ getIcon(c.type) }} {{ c.name }}</span>
            </el-radio>
          </el-radio-group>
          <template #footer><el-button @click="moveDialog.visible=false">取消</el-button><el-button type="primary" @click="confirmMove" :loading="store.loading">确认</el-button></template>
        </el-dialog>

        <!-- 清空 GitHub 数据弹窗 -->
        <el-dialog v-model="clearDialog.visible" title="清空 GitHub 数据" width="92%" :style="{maxWidth:'360px'}" :close-on-click-modal="false">
          <p style="color:#f56c6c;margin-bottom:12px;">⚠️ 此操作会删除 GitHub 上的 inventory.json 文件，并清空本地数据，不可恢复！</p>
          <p style="margin-bottom:8px;">请输入 <b>delete</b> 确认：</p>
          <el-input v-model="clearDialog.confirmText" placeholder="delete" />
          <template #footer><el-button @click="clearDialog.visible=false">取消</el-button><el-button type="danger" @click="doClearGitHub" :loading="store.loading">确认清空</el-button></template>
        </el-dialog>

        <!-- 管理弹窗（类别/标签/房间类型/柜子类型） -->
        <el-dialog v-model="manageDialog.visible" title="管理" width="92%" :style="{maxWidth:'500px'}" :close-on-click-modal="false">
          <div class="manage-dialog-body">
            <list-manager :title="manageIcon(manageDialog.type)" icon="📋" :items="manageItems(manageDialog.type)"
              @add="(n) => manageAdd(manageDialog.type, n)"
              @update="(i,n) => manageUpdate(manageDialog.type, i, n)"
              @delete="(i) => manageDelete(manageDialog.type, i)" />
          </div>
        </el-dialog>

        <!-- ===== DIALOGS ===== -->
        <el-dialog v-model="hd.visible" :title="hd.isEdit?'编辑小窝':'添加小窝'" width="92%" :style="{maxWidth:'420px'}" :close-on-click-modal="false">
          <el-form :model="hd.form" label-width="60px">
            <el-form-item label="名称" required><el-input v-model="hd.form.name" placeholder="如：我们的小窝" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="hd.form.remark" type="textarea" :rows="2" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button v-if="hd.isEdit" @click="dialogCopy('house')">📋 复制</el-button>
            <el-button v-if="hd.isEdit" danger @click="dialogDelete('house')">🗑️ 删除</el-button>
            <el-button @click="hd.visible=false">取消</el-button>
            <el-button type="primary" @click="saveHouse" :loading="store.loading">确认</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="rd.visible" :title="rd.isEdit?'编辑房间':'添加房间'" width="92%" :style="{maxWidth:'420px'}" :close-on-click-modal="false">
          <el-form :model="rd.form" label-width="60px">
            <el-form-item label="名称" required><el-input v-model="rd.form.name" placeholder="如：主卧" /></el-form-item>
            <el-form-item label="类型"><el-select v-model="rd.form.type" filterable allow-create default-first-option style="width:100%"><el-option v-for="t in store.roomTypes" :key="t.id" :label="t.name" :value="t.name" /></el-select></el-form-item>
            <el-form-item label="标签"><tag-input v-model="rd.form.tags" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="rd.form.remark" type="textarea" :rows="2" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button v-if="rd.isEdit" @click="dialogCopy('room')">📋 复制</el-button>
            <el-button v-if="rd.isEdit" danger @click="dialogDelete('room')">🗑️ 删除</el-button>
            <el-button @click="rd.visible=false">取消</el-button>
            <el-button type="primary" @click="saveRoom" :loading="store.loading">确认</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="cd.visible" :title="cd.isEdit?'编辑柜子':'添加柜子'" width="92%" :style="{maxWidth:'420px'}" :close-on-click-modal="false">
          <el-form :model="cd.form" label-width="60px">
            <el-form-item label="名称" required><el-input v-model="cd.form.name" placeholder="如：衣柜" /></el-form-item>
            <el-form-item label="类型"><el-select v-model="cd.form.type" filterable allow-create default-first-option style="width:100%"><el-option v-for="t in store.containerTypes" :key="t.id" :label="t.name" :value="t.name" /></el-select></el-form-item>
            <el-form-item label="标签"><tag-input v-model="cd.form.tags" /></el-form-item>
            <el-form-item label="图片"><image-upload v-model="cd.form.image" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="cd.form.remark" type="textarea" :rows="2" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button v-if="cd.isEdit" @click="dialogCopy('container')">📋 复制</el-button>
            <el-button v-if="cd.isEdit" danger @click="dialogDelete('container')">🗑️ 删除</el-button>
            <el-button @click="cd.visible=false">取消</el-button>
            <el-button type="primary" @click="saveContainer" :loading="store.loading">确认</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="bd.visible" :title="bd.isEdit?'编辑盒子':'添加盒子'" width="92%" :style="{maxWidth:'420px'}" :close-on-click-modal="false">
          <el-form :model="bd.form" label-width="60px">
            <el-form-item label="名称" required><el-input v-model="bd.form.name" placeholder="如：零食盒" /></el-form-item>
            <el-form-item label="颜色">
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <div v-for="c in presets.boxColors" :key="c" :style="{width:28+'px',height:28+'px',borderRadius:'50%',background:c,cursor:'pointer',border:bd.form.color===c?'3px solid #5a3a47':'2px solid #ffd6e0',boxShadow:bd.form.color===c?'0 0 6px rgba(0,0,0,0.3)':'none'}" @click="bd.form.color=c"></div>
              </div>
            </el-form-item>
            <el-form-item label="标签"><tag-input v-model="bd.form.tags" /></el-form-item>
            <el-form-item label="图片"><image-upload v-model="bd.form.image" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="bd.form.remark" type="textarea" :rows="2" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button v-if="bd.isEdit" @click="dialogCopy('box')">📋 复制</el-button>
            <el-button v-if="bd.isEdit" danger @click="dialogDelete('box')">🗑️ 删除</el-button>
            <el-button @click="bd.visible=false">取消</el-button>
            <el-button type="primary" @click="saveBox" :loading="store.loading">确认</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="id2.visible" :title="id2.isEdit?'编辑物品':'添加物品'" width="92%" :style="{maxWidth:'460px'}" :close-on-click-modal="false">
          <el-form :model="id2.form" label-width="60px">
            <el-form-item label="名称" required><el-input v-model="id2.form.name" placeholder="如：冬季羽绒服" /></el-form-item>
            <el-form-item label="分类"><el-select v-model="id2.form.category" filterable allow-create default-first-option style="width:100%" @change="onCategoryChange"><el-option v-for="t in store.categories" :key="t.id" :label="t.name" :value="t.name" /></el-select></el-form-item>
            <el-form-item label="标签"><tag-input v-model="id2.form.tags" /></el-form-item>
            <el-form-item label="图片"><image-upload v-model="id2.form.image" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="id2.form.remark" type="textarea" :rows="2" /></el-form-item>
            <el-form-item v-if="id2.isEdit" label="创建"><span style="font-size:13px;color:#c48a9c;">{{ formatTime(id2.form.createTime) }}</span></el-form-item>
          </el-form>
          <template #footer>
            <el-button v-if="id2.isEdit" @click="dialogCopy('item')">📋 复制</el-button>
            <el-button v-if="id2.isEdit" danger @click="dialogDelete('item')">🗑️ 删除</el-button>
            <el-button @click="id2.visible=false">取消</el-button>
            <el-button type="primary" @click="saveItem" :loading="store.loading">确认</el-button>
          </template>
        </el-dialog>

        <!-- 家人们成员弹窗 -->
        <el-dialog v-model="fd.visible" :title="fd.isEdit?'编辑家人':'添加家人'" width="92%" :style="{maxWidth:'380px'}" :close-on-click-modal="false">
          <el-form :model="fd.form" label-width="60px">
            <el-form-item label="姓名" required><el-input v-model="fd.form.name" placeholder="姓名" /></el-form-item>
            <el-form-item label="性别">
              <el-radio-group v-model="fd.form.gender">
                <el-radio label="male">👨 男性</el-radio>
                <el-radio label="female">👩 女性</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="关系">
              <el-select v-model="fd.form.relation" filterable allow-create default-first-option style="width:100%" placeholder="如：父亲 / 母亲 / 儿子 / 女儿">
                <el-option label="父亲" value="父亲" />
                <el-option label="母亲" value="母亲" />
                <el-option label="儿子" value="儿子" />
                <el-option label="女儿" value="女儿" />
                <el-option label="兄弟" value="兄弟" />
                <el-option label="姐妹" value="姐妹" />
                <el-option label="祖父" value="祖父" />
                <el-option label="祖母" value="祖母" />
                <el-option label="外祖父" value="外祖父" />
                <el-option label="外祖母" value="外祖母" />
              </el-select>
            </el-form-item>
            <el-form-item label="头像"><image-upload v-model="fd.form.avatar" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="fd.form.notes" type="textarea" :rows="2" placeholder="生日、职业等" /></el-form-item>
          </el-form>
          <template #footer><el-button @click="fd.visible=false">取消</el-button><el-button type="primary" @click="saveFamilyMember">确认</el-button></template>
        </el-dialog>
      </div>
    `,
    setup() {
      const presets = PRESETS;
      const currentFeature = ref(null);
      const isMobileView = ref(isMobile());
      const desktopTreeRef = ref(null);
      const mobileTreeRef = ref(null);
      const expandedIds = reactive(new Set());
      const searchVisible = ref(false);
      const searchQuery = ref('');
      const searchResults = ref([]);
      const showSearch = ref(false);
      const showMobileTree = ref(false);
      const sidebarCollapsed = ref(false);
      const cardAreaRef = ref(null);
      const zoom = ref(1);
      const compactMode = ref(true);
      const manageDialog = reactive({ visible: false, type: 'category' });
      const moveDialog = reactive({ visible: false, entity: null, type: '', candidates: [], selectedParentId: '' });
      const clearDialog = reactive({ visible: false, confirmText: '' });
      const fd = reactive({ visible: false, isEdit: false, editId: null, form: { name: '', gender: 'male', parentId: '', spouseId: '', relation: '', avatar: '', notes: '' } });

      window.addEventListener('resize', () => { isMobileView.value = isMobile(); });

      let syncTimer = null;
      function startAutoSync() { stopAutoSync(); syncTimer = setInterval(function() { if (store.dirty) syncToGitHub(); if (store.familyDirty) syncFamilyToGitHub(); }, 30000); }
      function stopAutoSync() { if (syncTimer) { clearInterval(syncTimer); syncTimer = null; } }
      startAutoSync();
      window.addEventListener('beforeunload', (e) => {
        if (store.dirty) { e.preventDefault(); e.returnValue = '还有未同步的更改，确定要离开吗？'; }
      });

      var dragState = null, pinchDist = 0, cListeners = [];
      function addL(el, type, fn, opts) { el.addEventListener(type, fn, opts); cListeners.push(function() { el.removeEventListener(type, fn); }); }
      function addD(type, fn) { document.addEventListener(type, fn); cListeners.push(function() { document.removeEventListener(type, fn); }); }
      function initCardArea(el) {
        addL(el, 'wheel', function(e) { e.preventDefault(); zoom.value = Math.max(0.5, Math.min(2, zoom.value - e.deltaY * 0.01)); });
        addL(el, 'mousedown', function(e) {
          if (e.button !== 0) return;
          if (e.target.closest('.entity-card, button, a, input, textarea, .tree-act-btn, .el-dropdown')) return;
          dragState = { sx: e.clientX, sy: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
        });
        addD('mousemove', function(e) {
          if (!dragState) return;
          var dx = e.clientX - dragState.sx, dy = e.clientY - dragState.sy;
          if (!dragState.moved && (dx*dx + dy*dy > 16)) dragState.moved = true;
          if (dragState.moved) { el.scrollLeft = dragState.sl - dx; el.scrollTop = dragState.st - dy; }
        });
        addD('mouseup', function() { dragState = null; });
        addL(el, 'touchstart', function(e) {
          if (e.touches.length === 2) {
            pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          } else if (e.touches.length === 1) {
            if (e.target.closest('.entity-card, button, a, input, textarea, .tree-act-btn, .el-dropdown')) return;
            dragState = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
          }
        }, { passive: true });
        addL(el, 'touchmove', function(e) {
          if (e.touches.length === 2) {
            e.preventDefault();
            var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            var diff = d - pinchDist;
            if (Math.abs(diff) > 10) { zoom.value = Math.max(0.5, Math.min(2, zoom.value + diff * 0.01)); pinchDist = d; }
          } else if (e.touches.length === 1 && dragState) {
            var dx = e.touches[0].clientX - dragState.sx, dy = e.touches[0].clientY - dragState.sy;
            if (!dragState.moved && (dx*dx + dy*dy > 16)) dragState.moved = true;
            if (dragState.moved) { el.scrollLeft = dragState.sl - dx; el.scrollTop = dragState.st - dy; }
          }
        }, { passive: false });
        addL(el, 'touchend', function() { dragState = null; pinchDist = 0; }, { passive: true });
      }
      function detachCardArea() {
        for (var i = 0; i < cListeners.length; i++) try { cListeners[i](); } catch(ex) {}
        cListeners = [];
        dragState = null;
      }
      function attachCardArea() {
        var el = cardAreaRef.value;
        if (!el) { setTimeout(attachCardArea, 30); return; }
        initCardArea(el);
      }
      watch(currentFeature, function(val) {
        if (val === 'storage') attachCardArea();
        else detachCardArea();
      });
      onUnmounted(detachCardArea);

      function refreshFromGitHub() {
        if (!isOnlineSyncEnabled()) { ElementPlus.ElMessage.warning('GitHub 同步未开启'); return; }
        ElementPlus.ElMessage.info('正在从 GitHub 加载...');
        fetchData().then(() => { store.houses.forEach(h => expandedIds.add(h.id)); });
      }
      function toggleUseGitHub() {
        store.useGitHub = !store.useGitHub;
        saveUseGitHubSetting();
        ElementPlus.ElMessage.info(store.useGitHub ? '已开启 GitHub 同步' : '已关闭 GitHub 同步，仅使用本地数据');
        if (store.useGitHub) syncToGitHub();
      }
      function manualSync() { syncToGitHub(); }
      function showClearDialog() { clearDialog.confirmText = ''; clearDialog.visible = true; }
      async function doClearGitHub() {
        if (clearDialog.confirmText !== 'delete') { ElementPlus.ElMessage.warning('请输入 delete 确认清空'); return; }
        await clearGitHubFile();
        clearDialog.visible = false;
      }

      const zoomPercent = computed(() => Math.round(zoom.value * 100));
      const spacingClass = computed(() => compactMode.value ? 'compact' : 'comfortable');
      const syncStatusText = computed(() => {
        if (store.syncError) return '⚠️ 同步失败';
        if (store.loading) return '🔄 同步中...';
        if (store.dirty) return '💾 有未同步更改';
        if (store.lastSync) return '✅ 已同步';
        return '📂 已加载本地';
      });
      function zoomIn() { zoom.value = Math.min(zoom.value + 0.1, 2); }
      function zoomOut() { zoom.value = Math.max(zoom.value - 0.1, 0.5); }
      function zoomReset() { zoom.value = 1; }
      function toggleSpacing() { compactMode.value = !compactMode.value; }

      function allowTreeDrag(node) { return true; }
      function allowTreeDrop(dragNode, dropNode, type) {
        const dragType = dragNode.data.type;
        const dropType = dropNode.data.type;
        if (dragNode.data.entity.id === dropNode.data.entity.id) return false;
        if (type === 'inner') {
          if (!canContain(dropType, dragType)) return false;
          if (dragType === 'box' && dropType === 'box' && containsEntity(dragNode.data.entity, 'box', dropNode.data.entity.id)) return false;
          return true;
        }
        if (type === 'before' || type === 'after') return dragType === dropType;
        return false;
      }
      function containsEntity(parent, parentType, targetId) {
        for (const key of (CHILD_KEYS[parentType] || [])) {
          for (const child of (parent[key] || [])) {
            if (child.id === targetId) return true;
            if (containsEntity(child, keyToType(key), targetId)) return true;
          }
        }
        return false;
      }
      function handleTreeDrop(dragNode, dropNode, dropType) {
        const dragType = dragNode.data.type;
        const dropTypeVal = dropNode.data.type;
        const dragEntity = dragNode.data.entity;
        const dropEntity = dropNode.data.entity;
        if (dropType === 'inner') {
          moveEntityToParent(dragEntity, dragType, dropEntity, dropTypeVal);
        } else {
          moveEntityBeforeAfter(dragEntity, dragType, dropEntity, dropTypeVal, dropType);
        }
        nextTick(() => { expandedIds.add(dropEntity.id); markDirty(); });
      }
      function moveEntityToParent(entity, type, target, targetType) {
        const dragInfo = findEntityParent(entity, type);
        if (!dragInfo) return;
        dragInfo.array.splice(dragInfo.index, 1);
        const key = childKeyFor(type);
        const arr = target[key] || (target[key] = []);
        arr.push(entity);
      }
      function moveEntityBeforeAfter(entity, type, targetEntity, targetType, position) {
        const dragInfo = findEntityParent(entity, type);
        const dropInfo = findEntityParent(targetEntity, targetType);
        if (!dragInfo || !dropInfo) return;
        let insertIndex = dropInfo.index;
        const sameArray = dragInfo.array === dropInfo.array;
        if (sameArray && dragInfo.index < insertIndex) {
          if (position === 'before') insertIndex--;
        } else {
          if (position === 'after') insertIndex++;
        }
        dragInfo.array.splice(dragInfo.index, 1);
        dropInfo.array.splice(insertIndex, 0, entity);
      }

      function collectMoveCandidates(entity, type) {
        const list = [];
        function add(e, t, depth) {
          if (canContain(t, type) && (!entity || e.id !== entity.id)) {
            list.push({ id: e.id, name: e.name, type: t, depth, entity: e });
          }
        }
        function walkBoxes(boxes, depth) {
          (boxes || []).forEach(b => {
            add(b, 'box', depth);
            walkBoxes(b.boxes, depth + 1);
          });
        }
        if (type === 'room') {
          store.houses.forEach(h => add(h, 'house', 0));
        } else if (type === 'container') {
          store.houses.forEach(h => (h.rooms || []).forEach(r => add(r, 'room', 1)));
        } else if (type === 'box' || type === 'item') {
          store.houses.forEach(h => {
            (h.rooms || []).forEach(r => {
              add(r, 'room', 1);
              (r.containers || []).forEach(c => {
                add(c, 'container', 2);
                walkBoxes(c.boxes, 3);
              });
              walkBoxes(r.boxes, 2);
            });
          });
        }
        if (entity && (type === 'box' || type === 'item')) {
          const descendantIds = new Set();
          function collectDescendants(e, t) {
            (CHILD_KEYS[t] || []).forEach(key => {
              (e[key] || []).forEach(child => {
                descendantIds.add(child.id);
                collectDescendants(child, keyToType(key));
              });
            });
          }
          collectDescendants(entity, type);
          return list.filter(c => !descendantIds.has(c.id));
        }
        return list;
      }
      function openMoveDialog(entity, type) {
        if (type === 'house') return;
        moveDialog.entity = entity;
        moveDialog.type = type;
        moveDialog.candidates = collectMoveCandidates(entity, type);
        const current = findEntityParent(entity, type);
        moveDialog.selectedParentId = current && current.parent !== store ? current.parent.id : '';
        moveDialog.visible = true;
      }
      function confirmMove() {
        const candidate = moveDialog.candidates.find(c => c.id === moveDialog.selectedParentId);
        if (!candidate || !moveDialog.entity) { moveDialog.visible = false; return; }
        const current = findEntityParent(moveDialog.entity, moveDialog.type);
        if (current && current.parent === candidate.entity) { moveDialog.visible = false; return; }
        moveEntityToParent(moveDialog.entity, moveDialog.type, candidate.entity, candidate.type);
        moveDialog.visible = false;
        nextTick(() => { expandedIds.add(candidate.id); markDirty(); });
      }

      const hd = reactive({ visible: false, isEdit: false, form: { name: '', remark: '' }, editId: null });
      const rd = reactive({ visible: false, isEdit: false, form: { name: '', type: '', tags: [], remark: '' }, editId: null, parentHouse: null });
      const cd = reactive({ visible: false, isEdit: false, form: { name: '', type: '', tags: [], remark: '' }, editId: null, parentRoom: null });
      const bd = reactive({ visible: false, isEdit: false, form: { name: '', color: '', tags: [], remark: '' }, editId: null, parentObj: null });
      const id2 = reactive({ visible: false, isEdit: false, form: { name: '', category: '', tags: [], image: '', remark: '', createTime: null }, editId: null, parentObj: null, editItemData: null });

      function buildTreeNode(entity, type) {
        const label = entity.name;
        const node = { id: type + '-' + entity.id, label, type, origId: entity.id, entity, children: [] };
        getChildren(entity, type).forEach(ch => node.children.push(buildTreeNode(ch.entity, ch.type)));
        return node;
      }

      const treeData = computed(() => store.houses.map(h => buildTreeNode(h, 'house')));
      const allExpandedKeys = computed(() => {
        const keys = [];
        (function collect(nodes) { nodes.forEach(n => { keys.push(n.id); collect(n.children || []); }); })(treeData.value);
        return keys;
      });

      function enterFeature(name) {
        currentFeature.value = name;
        if (name === 'storage') {
          fetchData().then(() => { store.houses.forEach(h => expandedIds.add(h.id)); });
        } else if (name === 'family') {
          fetchFamilyData();
        }
      }
      function enterFamilyFeature() {
        fetchFamilyData();
      }

      function showManageDialog(type) { manageDialog.type = type; manageDialog.visible = true; }
      function manageIcon(t) {
        return { category: '🏷️物品', tag: '🔖标签', roomType: '🚪房间', containerType: '🗄️柜子' }[t] || t;
      }
      function manageItems(t) {
        return { category: store.categories, tag: store.tags, roomType: store.roomTypes, containerType: store.containerTypes }[t] || [];
      }
      function manageAdd(t, name) {
        const fns = { category: addCategory, tag: addTag, roomType: addRoomType, containerType: addContainerType };
        if (fns[t]) fns[t](name);
      }
      function manageUpdate(t, item, name) {
        const fns = { category: updateCategory, tag: updateTag, roomType: updateRoomType, containerType: updateContainerType };
        if (fns[t]) fns[t](item, name);
      }
      function manageDelete(t, item) {
        const fns = { category: deleteCategory, tag: deleteTag, roomType: deleteRoomType, containerType: deleteContainerType };
        if (fns[t]) fns[t](item);
      }

      function toggleExpand(id) {
        expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id);
      }
      function expandAll(entity, type) {
        addAllDescendants(entity, type);
      }
      function toggleExpandAll(entity, type) {
        if (allCollapsed(entity, type)) {
          addAllDescendants(entity, type);
        } else {
          removeAllDescendants(entity, type);
        }
      }
      function addAllDescendants(entity, type) {
        expandedIds.add(entity.id);
        (CHILD_KEYS[type] || []).forEach(key => {
          (entity[key] || []).forEach(child => addAllDescendants(child, keyToType(key)));
        });
      }
      function removeAllDescendants(entity, type) {
        (CHILD_KEYS[type] || []).forEach(key => {
          (entity[key] || []).forEach(child => { expandedIds.delete(child.id); removeAllDescendants(child, keyToType(key)); });
        });
      }
      function allCollapsed(entity, type) {
        for (const key of (CHILD_KEYS[type] || [])) {
          for (const child of (entity[key] || [])) {
            if (expandedIds.has(child.id)) return false;
            if (!allCollapsed(child, keyToType(key))) return false;
          }
        }
        return true;
      }

      function toggleSearch() {
        searchVisible.value = !searchVisible.value;
        if (!searchVisible.value) closeSearch();
      }
      function closeSearch() { searchVisible.value = false; showSearch.value = false; searchResults.value = []; searchQuery.value = ''; }

      function doSearch() {
        if (!searchQuery.value.trim()) { searchResults.value = []; showSearch.value = false; return; }
        const q = searchQuery.value.trim().toLowerCase();
        const results = [];
        function traverse(entity, type, path) {
          const fp = path.concat([entity]);
          const pathStr = fp.map(e => e.name).join(' › ');
          const name = (entity.name || '').toLowerCase();
          const remark = (entity.remark || '').toLowerCase();
          let match = name.indexOf(q) !== -1 || remark.indexOf(q) !== -1;
          if (match) results.push({ entity, type, name: entity.name, path: pathStr });
          getChildren(entity, type).forEach(ch => traverse(ch.entity, ch.type, fp));
        }
        store.houses.forEach(h => traverse(h, 'house', []));
        searchResults.value = results;
        showSearch.value = true;
      }

      function navToSearchResult(r) {
        closeSearch();
        expandToEntity(r.entity.id);
        nextTick(() => {
          const el = document.getElementById('card-' + r.entity.id);
          if (el) {
            el.classList.add('highlight');
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            setTimeout(() => el.classList.remove('highlight'), 2300);
          }
        });
      }

      function expandToEntity(targetId) {
        expandedIds.clear();
        for (const h of store.houses) {
          expandedIds.add(h.id);
          if (h.id === targetId) return;
          for (const r of (h.rooms || [])) {
            expandedIds.add(r.id);
            if (r.id === targetId) return;
            if (findInRoom(r, targetId)) return;
          }
        }
      }

      function findInRoom(room, targetId) {
        for (const c of (room.containers || [])) { expandedIds.add(c.id); if (c.id === targetId) return true; if (findInBoxLike(c, targetId)) return true; }
        for (const b of (room.boxes || [])) { expandedIds.add(b.id); if (b.id === targetId) return true; if (findInBoxLike(b, targetId)) return true; }
        for (const i of (room.items || [])) { if (i.id === targetId) return true; }
        return false;
      }

      function findInBoxLike(parent, targetId) {
        for (const b of (parent.boxes || [])) { expandedIds.add(b.id); if (b.id === targetId) return true; if (findInBoxLike(b, targetId)) return true; }
        for (const i of (parent.items || [])) { if (i.id === targetId) return true; }
        return false;
      }

      function onTreeNodeClick(data) { closeSearch(); expandToEntity(data.origId); }
      function onMobileTreeNodeClick(data) { onTreeNodeClick(data); showMobileTree.value = false; }

      function onTreeAddContainer(data) { showAddContainer(data.entity); }
      function onTreeAddBox(data) { showAddBox(data.entity); }
      function onTreeAddItem(data) { showAddItem(data.entity); }
      function onTreeAction(data, cmd) {
        if (cmd === 'copy') { treeCopy(data); return; }
        if (cmd === 'add-room') { showAddRoom(data); return; }
        if (cmd === 'add-container') { onTreeAddContainer(data); return; }
        if (cmd === 'add-box') { onTreeAddBox(data); return; }
        if (cmd === 'add-item') { onTreeAddItem(data); return; }
        if (cmd === 'edit') { editFromTree(data); return; }
        if (cmd === 'delete') { deleteFromTree(data); return; }
      }
      function treeMoveUp(data) { moveEntityUp(data.entity, data.type); markDirty(); }
      function treeMoveDown(data) { moveEntityDown(data.entity, data.type); markDirty(); }
      function treeCopy(data) { copyEntity(data.entity, data.type); markDirty(); ElementPlus.ElMessage.success('已复制 ' + data.entity.name); }
      function copyFromCard(entity, type) {
        const clone = copyEntity(entity, type);
        if (clone) { markDirty(); ElementPlus.ElMessage.success('已复制 ' + entity.name); }
      }

      // ===== Family =====
      function showFamilyAdd(parentId) {
        fd.isEdit = false; fd.editId = null;
        fd.form = { name: '', gender: 'male', parentId: parentId || '', spouseId: '', relation: '', avatar: '', notes: '' };
        fd.visible = true;
      }
      function showFamilyEdit(member) {
        fd.isEdit = true; fd.editId = member.id;
        fd.form = { name: member.name, gender: member.gender, parentId: member.parentId || '', spouseId: member.spouseId || '', relation: member.relation || '', avatar: member.avatar || '', notes: member.notes || '' };
        fd.visible = true;
      }
      function saveFamilyMember() {
        if (!fd.form.name) { ElementPlus.ElMessage.warning('请输入姓名'); return; }
        if (fd.isEdit) {
          var m = store.familyMembers.find(function(x) { return x.id === fd.editId; });
          if (m) { m.name = fd.form.name; m.gender = fd.form.gender; m.parentId = fd.form.parentId || ''; m.spouseId = fd.form.spouseId || ''; m.relation = fd.form.relation || ''; m.avatar = fd.form.avatar || ''; m.notes = fd.form.notes || ''; }
        } else {
          store.familyMembers.push({ id: genId(), name: fd.form.name, gender: fd.form.gender, parentId: fd.form.parentId || '', spouseId: fd.form.spouseId || '', relation: fd.form.relation || '', avatar: fd.form.avatar || '', notes: fd.form.notes || '' });
        }
        fd.visible = false; markFamilyDirty();
      }
      function deleteFamilyMember(member) {
        ElementPlus.ElMessageBox.confirm('确定删除「' + member.name + '」及其关系吗？', '确认删除', { type: 'warning' }).then(function() {
          removeFromArray(store.familyMembers, member.id);
          // 清理其他成员中对此人的引用
          store.familyMembers.forEach(function(m) {
            if (m.parentId === member.id) m.parentId = '';
            if (m.spouseId === member.id) m.spouseId = '';
          });
          markFamilyDirty();
        }).catch(function() {});
      }
      function getFamilyById(id) { return store.familyMembers.find(function(m) { return m.id === id; }); }
      function getSpouse(member) { return member.spouseId ? getFamilyById(member.spouseId) : null; }
      function getChildren(member) { return store.familyMembers.filter(function(m) { return m.parentId === member.id; }); }
      function getParents(member) { return member.parentId ? [getFamilyById(member.parentId)] : []; }
      // 构建可视化族谱层级
      function buildFamilyTree() {
        var noParent = [], map = {};
        store.familyMembers.forEach(function(m) {
          map[m.id] = m;
          if (!m.parentId) noParent.push(m);
        });
        function level(m, d) { m._level = d; getChildren(m).forEach(function(c) { level(c, d + 1); }); }
        noParent.forEach(function(m) { level(m, 0); });
        var maxLevel = 0;
        store.familyMembers.forEach(function(m) { if (m._level > maxLevel) maxLevel = m._level; });
        var levels = [];
        for (var i = 0; i <= maxLevel; i++) levels.push([]);
        store.familyMembers.forEach(function(m) { levels[m._level].push(m); });
        return levels;
      }
      function addCategory(name) { store.categories.push({ id: genId(), name }); markDirty(); }
      function updateCategory(item, name) { item.name = name; markDirty(); }
      function deleteCategory(item) { ElementPlus.ElMessageBox.confirm('确定删除类别「' + item.name + '」吗？', '确认删除', { type: 'warning' }).then(() => { removeFromArray(store.categories, item.id); markDirty(); }).catch(() => {}); }

      function addTag(name) { store.tags.push({ id: genId(), name }); markDirty(); }
      function updateTag(item, name) { item.name = name; markDirty(); }
      function deleteTag(item) { ElementPlus.ElMessageBox.confirm('确定删除标签「' + item.name + '」吗？', '确认删除', { type: 'warning' }).then(() => { removeFromArray(store.tags, item.id); markDirty(); }).catch(() => {}); }

      function addRoomType(name) { store.roomTypes.push({ id: genId(), name }); markDirty(); }
      function updateRoomType(item, name) { item.name = name; markDirty(); }
      function deleteRoomType(item) { ElementPlus.ElMessageBox.confirm('确定删除房间类型「' + item.name + '」吗？', '确认', { type: 'warning' }).then(() => { removeFromArray(store.roomTypes, item.id); markDirty(); }).catch(() => {}); }
      function addContainerType(name) { store.containerTypes.push({ id: genId(), name }); markDirty(); }
      function updateContainerType(item, name) { item.name = name; markDirty(); }
      function deleteContainerType(item) { ElementPlus.ElMessageBox.confirm('确定删除柜子类型「' + item.name + '」吗？', '确认', { type: 'warning' }).then(() => { removeFromArray(store.containerTypes, item.id); markDirty(); }).catch(() => {}); }

      function onCategoryChange(val) {
        if (val && !store.categories.find(c => c.name === val)) {
          store.categories.push({ id: genId(), name: val });
        }
      }

      // ===== House =====
      function showAddHouse() { hd.isEdit = false; hd.editId = null; hd.form = { name: '', remark: '' }; hd.visible = true; }
      function saveHouse() {
        if (!hd.form.name) { ElementPlus.ElMessage.warning('请输入名称'); return; }
        if (hd.isEdit) {
          const h = store.houses.find(x => x.id === hd.editId);
          if (h) { h.name = hd.form.name; h.remark = hd.form.remark || ''; }
        } else {
          const nh = { id: genId(), name: hd.form.name, remark: hd.form.remark || '', rooms: [] };
          store.houses.push(nh); expandedIds.add(nh.id);
        }
        hd.visible = false; markDirty();
      }

      // ===== Room =====
      function showAddRoom(treeData) { showAddRoomForHouse(treeData.entity); }
      function showAddRoomForHouse(house) { rd.isEdit = false; rd.editId = null; rd.parentHouse = house; rd.form = { name: '', type: '', tags: [], remark: '' }; rd.visible = true; }
      function saveRoom() {
        if (!rd.form.name) { ElementPlus.ElMessage.warning('请输入名称'); return; }
        if (!rd.parentHouse) return;
        ensureArray(rd.parentHouse, 'rooms');
        if (rd.isEdit) {
          const r = rd.parentHouse.rooms.find(x => x.id === rd.editId);
          if (r) { r.name = rd.form.name; r.type = rd.form.type || ''; r.tags = rd.form.tags || []; r.remark = rd.form.remark || ''; }
        } else {
          rd.parentHouse.rooms.push({ id: genId(), name: rd.form.name, type: rd.form.type || '', tags: rd.form.tags || [], remark: rd.form.remark || '', containers: [], boxes: [], items: [] });
        }
        expandedIds.add(rd.parentHouse.id); rd.visible = false; markDirty();
      }

      // ===== Container =====
      function showAddContainer(room) { cd.isEdit = false; cd.editId = null; cd.parentRoom = room; cd.form = { name: '', type: '', tags: [], image: '', remark: '' }; cd.visible = true; }
      function saveContainer() {
        if (!cd.form.name) { ElementPlus.ElMessage.warning('请输入名称'); return; }
        if (!cd.parentRoom) return;
        ensureArray(cd.parentRoom, 'containers');
        if (cd.isEdit) {
          const c = cd.parentRoom.containers.find(x => x.id === cd.editId);
          if (c) { c.name = cd.form.name; c.type = cd.form.type || ''; c.tags = cd.form.tags || []; c.image = cd.form.image || ''; c.remark = cd.form.remark || ''; }
        } else {
          cd.parentRoom.containers.push({ id: genId(), name: cd.form.name, type: cd.form.type || '', tags: cd.form.tags || [], image: cd.form.image || '', remark: cd.form.remark || '', boxes: [], items: [] });
        }
        expandedIds.add(cd.parentRoom.id); cd.visible = false; markDirty();
      }

      // ===== Box =====
      function showAddBox(parent) { bd.isEdit = false; bd.editId = null; bd.parentObj = parent; bd.form = { name: '', color: '', tags: [], image: '', remark: '' }; bd.visible = true; }
      function saveBox() {
        if (!bd.form.name) { ElementPlus.ElMessage.warning('请输入名称'); return; }
        if (!bd.parentObj) return;
        ensureArray(bd.parentObj, 'boxes');
        if (bd.isEdit && bd.editId) {
          const b = bd.parentObj.boxes.find(x => x.id === bd.editId);
          if (b) { b.name = bd.form.name; b.color = bd.form.color || ''; b.tags = bd.form.tags || []; b.image = bd.form.image || ''; b.remark = bd.form.remark || ''; }
        } else {
          bd.parentObj.boxes.push({ id: genId(), name: bd.form.name, color: bd.form.color || '', tags: bd.form.tags || [], image: bd.form.image || '', remark: bd.form.remark || '', boxes: [], items: [] });
        }
        expandedIds.add(bd.parentObj.id); bd.visible = false; markDirty();
      }

      // ===== Item =====
      function showAddItem(parent) { id2.isEdit = false; id2.editId = null; id2.parentObj = parent; id2.editItemData = null; id2.form = { name: '', category: '', tags: [], image: '', remark: '', createTime: null }; id2.visible = true; }
      function saveItem() {
        if (!id2.form.name) { ElementPlus.ElMessage.warning('请输入物品名称'); return; }
        ensureArray(id2.parentObj, 'items');
        if (id2.isEdit && id2.editItemData) {
          const it = id2.editItemData;
          it.name = id2.form.name; it.category = id2.form.category || ''; it.tags = id2.form.tags || []; it.image = id2.form.image || ''; it.remark = id2.form.remark || '';
        } else {
          id2.parentObj.items.push({ id: genId(), name: id2.form.name, category: id2.form.category || '', tags: id2.form.tags || [], image: id2.form.image || '', remark: id2.form.remark || '', createTime: Date.now() });
        }
        expandedIds.add(id2.parentObj.id); id2.visible = false; markDirty();
      }

      // ===== Edit / Delete =====
      function getEditingEntity(dialog, type) {
        if (type === 'house') return store.houses.find(h => h.id === dialog.editId);
        if (type === 'room') { for (const h of store.houses) { const r = h.rooms.find(x => x.id === dialog.editId); if (r) return r; } return null; }
        if (type === 'container') { for (const h of store.houses) for (const r of (h.rooms || [])) { const c = r.containers.find(x => x.id === dialog.editId); if (c) return c; } return null; }
        if (type === 'box') { for (const h of store.houses) for (const r of (h.rooms || [])) { for (const c of (r.containers || [])) { const b = c.boxes.find(x => x.id === dialog.editId); if (b) return b; } for (const b of (r.boxes || [])) { const bx = b.boxes.find(x => x.id === dialog.editId); if (bx) return bx; } } return null; }
        if (type === 'item') return dialog.editItemData || null;
        return null;
      }
      function dialogCopy(type) {
        const items = { house: hd, room: rd, container: cd, box: bd, item: id2 };
        const entity = getEditingEntity(items[type], type);
        if (entity) { copyFromCard(entity, type); }
      }
      function dialogDelete(type) {
        const items = { house: hd, room: rd, container: cd, box: bd, item: id2 };
        const entity = getEditingEntity(items[type], type);
        if (entity) { items[type].visible = false; deleteEntity(entity, type); }
      }
      function editEntity(entity, type) {
        if (type === 'house') { hd.isEdit = true; hd.editId = entity.id; hd.form = { name: entity.name, remark: entity.remark || '' }; hd.visible = true; }
        else if (type === 'room') { rd.isEdit = true; rd.editId = entity.id; rd.parentHouse = findParentOfRoom(entity.id); rd.form = { name: entity.name, type: entity.type || '', tags: entity.tags || [], remark: entity.remark || '' }; rd.visible = true; }
        else if (type === 'container') { cd.isEdit = true; cd.editId = entity.id; cd.parentRoom = findParentOfContainer(entity.id); cd.form = { name: entity.name, type: entity.type || '', tags: entity.tags || [], image: entity.image || '', remark: entity.remark || '' }; cd.visible = true; }
        else if (type === 'box') { bd.isEdit = true; bd.editId = entity.id; bd.parentObj = findParentOfBox(entity.id); bd.form = { name: entity.name, color: entity.color || '', tags: entity.tags || [], image: entity.image || '', remark: entity.remark || '' }; bd.visible = true; }
        else if (type === 'item') { id2.isEdit = true; id2.editId = entity.id; id2.editItemData = entity; id2.parentObj = findParentOfItem(entity.id); id2.form = { name: entity.name, category: entity.category || '', tags: entity.tags || [], image: entity.image || '', remark: entity.remark || '', createTime: entity.createTime }; id2.visible = true; }
      }
      function editFromTree(treeData) { editEntity(treeData.entity, treeData.type); }

      function deleteEntity(entity, type) {
        ElementPlus.ElMessageBox.confirm('确定删除「' + entity.name + '」及其所有子级吗？', '确认删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
          .then(() => {
            if (type === 'house') removeFromArray(store.houses, entity.id);
            else if (type === 'room') { for (const h of store.houses) if (removeFromArray(h.rooms, entity.id)) break; }
            else if (type === 'container') { for (const h of store.houses) for (const r of (h.rooms || [])) if (removeFromArray(r.containers, entity.id)) break; }
            else if (type === 'box') removeBoxFromHouses(entity.id);
            else if (type === 'item') removeItemFromHouses(entity.id);
            expandedIds.delete(entity.id); markDirty();
          }).catch(() => {});
      }
      function deleteFromTree(treeData) { deleteEntity(treeData.entity, treeData.type); }

      function removeBoxFromHouses(targetId) {
        for (const h of store.houses) for (const r of (h.rooms || [])) {
          if (removeFromArray(r.boxes, targetId)) return;
          for (const c of (r.containers || [])) if (removeBoxRecursive(c, targetId)) return;
          for (const b of (r.boxes || [])) if (removeBoxRecursive(b, targetId)) return;
        }
      }
      function removeBoxRecursive(parent, targetId) {
        if (removeFromArray(parent.boxes, targetId)) return true;
        for (const b of (parent.boxes || [])) if (removeBoxRecursive(b, targetId)) return true;
        return false;
      }
      function removeItemFromHouses(targetId) {
        for (const h of store.houses) for (const r of (h.rooms || [])) {
          if (removeFromArray(r.items, targetId)) return;
          for (const c of (r.containers || [])) if (removeItemRecursive(c, targetId)) return;
          for (const b of (r.boxes || [])) if (removeItemRecursive(b, targetId)) return;
        }
      }
      function removeItemRecursive(parent, targetId) {
        if (removeFromArray(parent.items, targetId)) return true;
        for (const b of (parent.boxes || [])) if (removeItemRecursive(b, targetId)) return true;
        return false;
      }

      function findParentOfRoom(roomId) { for (const h of store.houses) for (const r of (h.rooms || [])) if (r.id === roomId) return h; return null; }
      function findParentOfContainer(contId) { for (const h of store.houses) for (const r of (h.rooms || [])) for (const c of (r.containers || [])) if (c.id === contId) return r; return null; }
      function findParentOfBox(boxId) {
        for (const h of store.houses) for (const r of (h.rooms || [])) {
          for (const b of (r.boxes || [])) if (b.id === boxId) return r;
          for (const c of (r.containers || [])) { const p = findBoxParentRecursive(c, boxId); if (p) return p; }
          for (const b of (r.boxes || [])) { const p = findBoxParentRecursive(b, boxId); if (p) return p; }
        }
        return null;
      }
      function findBoxParentRecursive(parent, boxId) {
        for (const b of (parent.boxes || [])) { if (b.id === boxId) return parent; }
        for (const b of (parent.boxes || [])) { const p = findBoxParentRecursive(b, boxId); if (p) return p; }
        return null;
      }
      function findParentOfItem(itemId) {
        for (const h of store.houses) for (const r of (h.rooms || [])) {
          for (const i of (r.items || [])) if (i.id === itemId) return r;
          for (const c of (r.containers || [])) { const p = findItemParentRecursive(c, itemId); if (p) return p; }
          for (const b of (r.boxes || [])) { const p2 = findItemParentRecursive(b, itemId); if (p2) return p2; }
        }
        return null;
      }
      function findItemParentRecursive(parent, itemId) {
        for (const i of (parent.items || [])) if (i.id === itemId) return parent;
        for (const b of (parent.boxes || [])) { const p = findItemParentRecursive(b, itemId); if (p) return p; }
        return null;
      }

      function logout() {
        stopAutoSync();
        localStorage.removeItem('xiaohua_xiaofeng_logged_in');
        store.loggedIn = false; store.githubToken = ''; store.githubRepo = ''; store.houses = []; store.categories = []; store.tags = []; store.roomTypes = []; store.containerTypes = []; store.familyMembers = [];
      }

      return {
        store, presets,
        currentFeature, isMobileView,
        desktopTreeRef, mobileTreeRef, cardAreaRef,
        expandedIds, sidebarCollapsed,
        searchVisible, searchQuery, searchResults, showSearch, showMobileTree,
        zoom, zoomPercent, compactMode, spacingClass, manageDialog, moveDialog, clearDialog, fd,
        syncStatusText,
        treeData, allExpandedKeys,
        hd, rd, cd, bd, id2,
        enterFeature, enterFamilyFeature, showManageDialog, toggleExpand, expandAll, toggleExpandAll,
        toggleSearch, closeSearch, doSearch, navToSearchResult,
        zoomIn, zoomOut, zoomReset, toggleSpacing,
        allowTreeDrag, allowTreeDrop, handleTreeDrop,
        openMoveDialog, confirmMove,
        toggleUseGitHub, manualSync, refreshFromGitHub, showClearDialog, doClearGitHub,
        isLocalMode, isOnlineSyncEnabled,
        onTreeNodeClick, onMobileTreeNodeClick,
        onTreeAddContainer, onTreeAddBox, onTreeAddItem, onTreeAction,
        addCategory, updateCategory, deleteCategory,
        addTag, updateTag, deleteTag,
        addRoomType, updateRoomType, deleteRoomType,
        addContainerType, updateContainerType, deleteContainerType,
        manageIcon, manageItems, manageAdd, manageUpdate, manageDelete,
        onCategoryChange,
        treeMoveUp, treeMoveDown, treeCopy, copyFromCard, dialogCopy, dialogDelete,
        showAddHouse, saveHouse,
        showAddRoom, showAddRoomForHouse, saveRoom,
        showAddContainer, saveContainer,
        showAddBox, saveBox,
        showAddItem, saveItem,
        editEntity, editFromTree,
        deleteEntity, deleteFromTree,
        formatTime, logout, getEntityTypeName, getIcon,
        showFamilyAdd, showFamilyEdit, saveFamilyMember, deleteFamilyMember,
        getFamilyById, getSpouse, getChildren, getParents, buildFamilyTree,
      };
    },
  };

  // ==================== 启动 ====================
  const app = createApp({
    template: '<LoginGate v-if="!store.loggedIn" /><MainApp v-else />',
    setup() { return { store }; },
  });

  app.component('LoginGate', LoginGate);
  app.component('MainApp', MainApp);
  app.component('CardNode', CardNode);
  app.component('TagInput', TagInput);
  app.component('ImageUpload', ImageUpload);
  app.component('ListManager', ListManager);
  app.directive('long-press', {
    mounted(el, binding) {
      let timer = null;
      let startPos = null;
      function start(e) {
        if (e.button && e.button !== 0) return;
        cancel();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startPos = { clientX, clientY };
        timer = setTimeout(() => { binding.value(e); timer = null; startPos = null; }, 600);
      }
      function move(e) {
        if (!timer || !startPos) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - startPos.clientX;
        const dy = clientY - startPos.clientY;
        if (Math.sqrt(dx * dx + dy * dy) > 10) cancel();
      }
      function cancel() { if (timer) { clearTimeout(timer); timer = null; } startPos = null; }
      el.addEventListener('mousedown', start);
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('mousemove', move);
      el.addEventListener('touchmove', move, { passive: true });
      el.addEventListener('mouseup', cancel);
      el.addEventListener('mouseleave', cancel);
      el.addEventListener('touchend', cancel);
      el.addEventListener('touchcancel', cancel);
      el.addEventListener('contextmenu', cancel);
      el._longPressCleanup = function() {
        el.removeEventListener('mousedown', start);
        el.removeEventListener('touchstart', start);
        el.removeEventListener('mousemove', move);
        el.removeEventListener('touchmove', move);
        el.removeEventListener('mouseup', cancel);
        el.removeEventListener('mouseleave', cancel);
        el.removeEventListener('touchend', cancel);
        el.removeEventListener('touchcancel', cancel);
        el.removeEventListener('contextmenu', cancel);
      };
    },
    unmounted(el) { if (el._longPressCleanup) el._longPressCleanup(); }
  });
  app.use(ElementPlus);

  if (typeof ElementPlusIconsVue !== 'undefined') {
    for (const key in ElementPlusIconsVue) {
      if (Object.prototype.hasOwnProperty.call(ElementPlusIconsVue, key)) app.component(key, ElementPlusIconsVue[key]);
    }
  }

  app.mount('#app');
})();
