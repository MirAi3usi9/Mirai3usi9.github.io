import { genId, CHILD_KEYS, keyToType, ensureArray, cloneEntity, removeFromArray, getChildren, canContain, DEFAULT_CATEGORIES, DEFAULT_TAGS, DEFAULT_ROOM_TYPES, DEFAULT_CONTAINER_TYPES } from './utils/helpers.js';
import { xorEncode, xorDecode } from './utils/crypto.js';

const { reactive, toRaw } = Vue;
const { ElMessage } = ElementPlus;

export const DATA_VERSION = 1;

export const store = reactive({
  loggedIn: false,
  githubToken: '',
  githubRepo: '',
  houses: [],
  categories: [],
  tags: [],
  roomTypes: [],
  containerTypes: [],
  familyMembers: [],
  loading: false,
  lastError: '',
  dirty: false,
  familyDirty: false,
  useGitHub: false,
  lastSync: null,
  syncError: '',
});

// ==================== 实体操作 ====================

function searchChildren(entity, type, parent, parentType) {
  const keys = CHILD_KEYS[parentType] || [];
  for (const key of keys) {
    const arr = parent[key] || [];
    const childType = keyToType(key);
    if (childKeyFor(type) === key) {
      const idx = arr.findIndex(child => child.id === entity.id);
      if (idx !== -1) return { parent, array: arr, index: idx };
    }
    for (const child of arr) {
      const result = searchChildren(entity, type, child, childType);
      if (result) return result;
    }
  }
  return null;
}
function childKeyFor(childType) {
  return childType === 'room' ? 'rooms' : childType === 'container' ? 'containers' : childType === 'box' ? 'boxes' : 'items';
}

export function findEntityParent(entity, type) {
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

export function moveEntityUp(entity, type) {
  const info = findEntityParent(entity, type);
  if (!info || info.index <= 0) return;
  const arr = info.array;
  if (info.index > 0) { [arr[info.index - 1], arr[info.index]] = [arr[info.index], arr[info.index - 1]]; }
}

export function moveEntityDown(entity, type) {
  const info = findEntityParent(entity, type);
  if (!info || info.index >= info.array.length - 1) return;
  const arr = info.array;
  [arr[info.index + 1], arr[info.index]] = [arr[info.index], arr[info.index + 1]];
}

export function copyEntity(entity, type) {
  const info = findEntityParent(entity, type);
  if (!info) return null;
  const clone = cloneEntity(entity, type);
  info.array.splice(info.index + 1, 0, clone);
  return clone;
}

export function moveEntityToParent(entity, type, target, targetType) {
  const dragInfo = findEntityParent(entity, type);
  if (!dragInfo) return;
  dragInfo.array.splice(dragInfo.index, 1);
  const key = childKeyFor(type);
  const arr = target[key] || (target[key] = []);
  arr.push(entity);
}

export function moveEntityBeforeAfter(entity, type, targetEntity, targetType, position) {
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

export function containsEntity(parent, parentType, targetId) {
  for (const key of (CHILD_KEYS[parentType] || [])) {
    for (const child of (parent[key] || [])) {
      if (child.id === targetId) return true;
      if (containsEntity(child, keyToType(key), targetId)) return true;
    }
  }
  return false;
}

export function isLocalMode() {
  return window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export function isOnlineSyncEnabled() {
  if (!store.githubToken || !store.githubRepo) return false;
  if (isLocalMode()) return store.useGitHub;
  return true;
}

// ==================== 元数据管理 ====================

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

// ==================== GitHub API ====================

function ghHeaders() {
  return { 'Authorization': 'Bearer ' + store.githubToken, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'xiaohua-xiaofeng-browser' };
}
function ghUrl() { return 'https://api.github.com/repos/' + store.githubRepo + '/contents/data/inventory.json'; }

export function loadUseGitHubSetting() {
  const v = localStorage.getItem('xiaohua_xiaofeng_use_github');
  store.useGitHub = v === 'true';
}
export function saveUseGitHubSetting() {
  localStorage.setItem('xiaohua_xiaofeng_use_github', store.useGitHub ? 'true' : 'false');
}

export async function fetchData() {
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
    ElMessage.success('已从 GitHub 加载到本地');
  } catch (e) {
    store.syncError = '拉取失败: ' + e.message;
    store.lastError = e.message;
    ElMessage.error('GitHub 拉取失败: ' + e.message);
  } finally { store.loading = false; }
}

export async function syncToGitHub() {
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
    ElMessage.success('已同步到 GitHub');
  } catch (e) {
    store.syncError = '同步失败: ' + e.message;
    store.lastError = '保存失败: ' + e.message;
    ElMessage.error(store.lastError);
  } finally { store.loading = false; }
}

export async function clearGitHubFile() {
  if (!store.githubToken || !store.githubRepo) { ElMessage.warning('未配置 GitHub'); return; }
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
    ElMessage.success('已清空 GitHub 数据');
  } catch (e) {
    store.syncError = '清空失败: ' + e.message;
    store.lastError = '清空失败: ' + e.message;
    ElMessage.error(store.lastError);
  } finally { store.loading = false; }
}

export function resetData() { store.houses = []; store.categories = []; store.tags = []; store.roomTypes = []; store.containerTypes = []; initDefaults(); }

// ==================== LocalStorage ====================

export function fetchLocalStorage() {
  const ver = localStorage.getItem('xiaohua_xiaofeng_version');
  if (ver !== String(DATA_VERSION)) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('xiaohua_xiaofeng_') === 0) localStorage.removeItem(k);
    }
    localStorage.setItem('xiaohua_xiaofeng_version', String(DATA_VERSION));
    resetData();
    return;
  }
  const data = localStorage.getItem('xiaohua_xiaofeng_data');
  if (data) {
    try {
      const parsed = JSON.parse(data);
      store.houses = parsed.houses || [];
      store.categories = parsed.categories || [];
      store.tags = parsed.tags || [];
      store.roomTypes = parsed.roomTypes || [];
      store.containerTypes = parsed.containerTypes || [];
    } catch (e) { resetData(); }
  } else { resetData(); }
  initDefaults();
}

export function saveToLocalStorage() {
  localStorage.setItem('xiaohua_xiaofeng_version', String(DATA_VERSION));
  localStorage.setItem('xiaohua_xiaofeng_data', JSON.stringify({ houses: toRaw(store.houses), categories: toRaw(store.categories), tags: toRaw(store.tags), roomTypes: toRaw(store.roomTypes), containerTypes: toRaw(store.containerTypes) }));
  store.dirty = false;
  store.lastSync = Date.now();
  localStorage.removeItem('xiaohua_xiaofeng_dirty');
  ElMessage.success('已保存到本地');
}

export function markDirty() {
  store.dirty = true;
  store.syncError = '';
  localStorage.setItem('xiaohua_xiaofeng_version', String(DATA_VERSION));
  localStorage.setItem('xiaohua_xiaofeng_dirty', 'true');
  localStorage.setItem('xiaohua_xiaofeng_data', JSON.stringify({ houses: toRaw(store.houses), categories: toRaw(store.categories), tags: toRaw(store.tags), roomTypes: toRaw(store.roomTypes), containerTypes: toRaw(store.containerTypes) }));
}

// ==================== 家人们 | 独立存储 ====================

function ghFamilyUrl() { return 'https://api.github.com/repos/' + store.githubRepo + '/contents/data/family.json'; }

export function fetchFamilyLocalStorage() {
  const d = localStorage.getItem('xiaohua_xiaofeng_family_data');
  try { store.familyMembers = d ? JSON.parse(d) : []; } catch(e) { store.familyMembers = []; }
}

export function saveFamilyToLocalStorage() {
  localStorage.setItem('xiaohua_xiaofeng_version', String(DATA_VERSION));
  localStorage.setItem('xiaohua_xiaofeng_family_data', JSON.stringify(toRaw(store.familyMembers)));
  store.familyDirty = false;
  store.lastSync = Date.now();
  localStorage.removeItem('xiaohua_xiaofeng_family_dirty');
}

export function markFamilyDirty() {
  store.familyDirty = true;
  localStorage.setItem('xiaohua_xiaofeng_version', String(DATA_VERSION));
  localStorage.setItem('xiaohua_xiaofeng_family_dirty', 'true');
  localStorage.setItem('xiaohua_xiaofeng_family_data', JSON.stringify(toRaw(store.familyMembers)));
}

export async function fetchFamilyData() {
  fetchFamilyLocalStorage();
  store.familyDirty = localStorage.getItem('xiaohua_xiaofeng_family_dirty') === 'true';
  if (!isOnlineSyncEnabled() || store.familyDirty) return;
  try {
    const resp = await fetch(ghFamilyUrl(), { headers: ghHeaders() });
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.content) return;
    const str = xorDecode(atob(data.content.trim()), 'hxf');
    store.familyMembers = JSON.parse(str) || [];
    store.lastSync = Date.now();
    saveFamilyToLocalStorage();
  } catch(e) { store.lastError = '家人们拉取失败: ' + e.message; }
}

export async function syncFamilyToGitHub() {
  if (!store.familyDirty) return;
  if (!isOnlineSyncEnabled()) { saveFamilyToLocalStorage(); return; }
  store.loading = true;
  try {
    const json = JSON.stringify(toRaw(store.familyMembers));
    const content = btoa(xorEncode(json, 'hxf'));
    const getResp = await fetch(ghFamilyUrl(), { headers: ghHeaders() });
    let sha = null;
    if (getResp.ok) { sha = (await getResp.json()).sha; }
    const body = { message: '更新家庭关系数据', content: content };
    if (sha) body.sha = sha;
    const putResp = await fetch(ghFamilyUrl(), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
    if (!putResp.ok) throw new Error('HTTP ' + putResp.status);
    store.familyDirty = false; store.lastSync = Date.now();
    saveFamilyToLocalStorage();
  } catch(e) { store.lastError = '家人们同步失败: ' + e.message; ElMessage.error(store.lastError); }
  finally { store.loading = false; }
}
