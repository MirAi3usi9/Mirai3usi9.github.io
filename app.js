(function () {
  'use strict';

  var VueApp = Vue.createApp;
  var ref = Vue.ref;
  var reactive = Vue.reactive;
  var computed = Vue.computed;
  var toRaw = Vue.toRaw;
  var onMounted = Vue.onMounted;
  var nextTick = Vue.nextTick;

  // ==================== 硬编码凭据 (XOR 加密, 口令解码) ====================
  var CRED_TOKEN = 'DxAWNxxXPz4eGTcgIRk0UCgKWj4zDxQVDxpTWAtWPS08XUovEj1RCw==';
  var CRED_REPO  = 'JREUKRFVHQsPUVcrAQoHAUsTGxFfRh8PHBATClYPBw==';

  // ==================== CONFIG ====================
  var PRESETS = {
    houseType: ['apartment', 'villa', 'bungalow'],
    roomType: ['bedroom', 'livingroom', 'kitchen', 'bathroom', 'balcony'],
    containerType: ['wardrobe', 'cabinet', 'drawer', 'shelf', 'box'],
    itemCategory: ['clothing', 'books', 'electronics', 'tools', 'food'],
  };

  // ==================== XOR 工具 ====================
  function xorEncode(str, key) {
    var encoder = new TextEncoder();
    var keyBytes = encoder.encode(key);
    var strBytes = encoder.encode(str);
    var result = new Uint8Array(strBytes.length);
    for (var i = 0; i < strBytes.length; i++) {
      result[i] = strBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    var binary = '';
    for (var i = 0; i < result.length; i++) {
      binary += String.fromCharCode(result[i]);
    }
    return btoa(binary);
  }

  function xorDecode(encoded, key) {
    var binary = atob(encoded);
    var keyBytes = new TextEncoder().encode(key);
    var result = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      result[i] = binary.charCodeAt(i) ^ keyBytes[i % keyBytes.length];
    }
    return new TextDecoder().decode(result);
  }

  // ==================== 通用工具 ====================
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  function buildTreeData(houses) {
    return (houses || []).map(function (h) {
      return {
        id: 'h-' + h.id,
        label: h.name + (h.type ? ' (' + h.type + ')' : ''),
        type: 'house',
        origId: h.id,
        data: h,
        children: (h.rooms || []).map(function (r) {
          return {
            id: 'r-' + r.id,
            label: r.name + (r.type ? ' (' + r.type + ')' : ''),
            type: 'room',
            origId: r.id,
            data: r,
            children: (r.containers || []).map(function (c) {
              return {
                id: 'c-' + c.id,
                label: c.name + (c.type ? ' (' + c.type + ')' : ''),
                type: 'container',
                origId: c.id,
                data: c,
                children: [],
              };
            }),
          };
        }),
      };
    });
  }

  function searchData(houses, query, mode) {
    if (!query) return [];
    var results = [];
    var q = query.toLowerCase();
    (houses || []).forEach(function (house) {
      (house.rooms || []).forEach(function (room) {
        (room.containers || []).forEach(function (container) {
          (container.items || []).forEach(function (item) {
            var match = false;
            if (mode === 'text') {
              match =
                (item.name || '').toLowerCase().indexOf(q) !== -1 ||
                (item.remark || '').toLowerCase().indexOf(q) !== -1 ||
                (container.name || '').toLowerCase().indexOf(q) !== -1 ||
                (room.name || '').toLowerCase().indexOf(q) !== -1 ||
                (house.name || '').toLowerCase().indexOf(q) !== -1;
            } else if (mode === 'category') {
              match = (item.category || '').toLowerCase().indexOf(q) !== -1;
            } else if (mode === 'type') {
              match = (container.type || '').toLowerCase().indexOf(q) !== -1;
            }
            if (match) {
              results.push({
                house: house,
                room: room,
                container: container,
                item: item,
                path: house.name + ' > ' + room.name + ' > ' + container.name + ' > ' + item.name,
              });
            }
          });
        });
      });
    });
    return results;
  }

  function findContainerById(houses, containerOrigId) {
    for (var hi = 0; hi < houses.length; hi++) {
      var h = houses[hi];
      for (var ri = 0; ri < (h.rooms || []).length; ri++) {
        var r = h.rooms[ri];
        for (var ci = 0; ci < (r.containers || []).length; ci++) {
          var c = r.containers[ci];
          if (c.id === containerOrigId) return c;
        }
      }
    }
    return null;
  }

  function getContainerPath(houses, containerOrigId) {
    for (var hi = 0; hi < houses.length; hi++) {
      var h = houses[hi];
      for (var ri = 0; ri < (h.rooms || []).length; ri++) {
        var r = h.rooms[ri];
        for (var ci = 0; ci < (r.containers || []).length; ci++) {
          var c = r.containers[ci];
          if (c.id === containerOrigId) {
            return h.name + ' > ' + r.name + ' > ' + c.name;
          }
        }
      }
    }
    return '';
  }

  function removeById(arr, id) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { arr.splice(i, 1); return true; }
    }
    return false;
  }

  function findTreeParents(treeData, nodeId) {
    var parents = [];
    for (var i = 0; i < treeData.length; i++) {
      var h = treeData[i];
      if (h.id === nodeId) { parents.push(h.id); return parents; }
      for (var j = 0; j < (h.children || []).length; j++) {
        var r = h.children[j];
        if (r.id === nodeId) { parents.push(h.id); parents.push(r.id); return parents; }
        for (var k = 0; k < (r.children || []).length; k++) {
          var c = r.children[k];
          if (c.id === nodeId) { parents.push(h.id); parents.push(r.id); parents.push(c.id); return parents; }
        }
      }
    }
    return parents;
  }

  function formatTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function isMobile() {
    return window.innerWidth < 768;
  }

  // ==================== STORE ====================
  var store = reactive({
    loggedIn: false,
    githubToken: '',
    githubRepo: '',
    houses: [],
    loading: false,
    lastError: '',
  });

  // ==================== GITHUB API ====================
  function ghHeaders() {
    return {
      'Authorization': 'Bearer ' + store.githubToken,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'home-manager-browser',
    };
  }

  function ghUrl() {
    return 'https://api.github.com/repos/' + store.githubRepo + '/contents/data/inventory.json';
  }

  async function fetchData() {
    store.loading = true;
    store.lastError = '';
    try {
      var resp = await fetch(ghUrl(), { headers: ghHeaders() });
      if (resp.status === 404) { store.houses = []; store.loading = false; return; }
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('GitHub Token 无效或权限不足 (' + resp.status + ')');
      }
      if (!resp.ok) throw new Error('GitHub API 响应 ' + resp.status);
      var data = await resp.json();
      if (!data.content) { store.houses = []; store.loading = false; return; }
      var innerBase64 = atob(data.content.trim());
      var jsonStr = xorDecode(innerBase64, 'hxf');
      var parsed = JSON.parse(jsonStr);
      store.houses = parsed.houses || [];
      store._lastSha = data.sha;
    } catch (e) {
      var msg = e.message;
      if (window.location.protocol === 'file:') {
        msg = '浏览器阻止了跨域请求（file:// 限制）。\n请改用本地 HTTP 服务器访问';
      }
      store.lastError = msg;
      ElementPlus.ElMessage.error('加载失败: ' + msg);
    } finally {
      store.loading = false;
    }
  }

  async function saveToGitHub() {
    store.loading = true;
    store.lastError = '';
    try {
      var jsonStr = JSON.stringify({ houses: toRaw(store.houses) });
      var innerBase64 = xorEncode(jsonStr, 'hxf');
      var fileContent = btoa(innerBase64);
      var getResp = await fetch(ghUrl(), { headers: ghHeaders() });
      var sha = null;
      if (getResp.ok) { var current = await getResp.json(); sha = current.sha; }
      var putBody = { message: '更新家庭收纳数据', content: fileContent };
      if (sha) putBody.sha = sha;
      var putResp = await fetch(ghUrl(), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(putBody) });
      if (!putResp.ok) { var errData = await putResp.json(); throw new Error(errData.message || 'HTTP ' + putResp.status); }
      ElementPlus.ElMessage.success('已同步');
    } catch (e) {
      store.lastError = '保存失败: ' + e.message;
      ElementPlus.ElMessage.error(store.lastError);
    } finally {
      store.loading = false;
    }
  }

  // ==================== 登录门 ====================
  var LoginGate = {
    template:
      '<div class="login-container">' +
        '<div class="login-card">' +
          '<div class="login-avatar">\uD83C\uDF3B</div>' +
          '<h1>\u5C0F\u82B1\u4E0E\u5C0F\u98CE</h1>' +
          '<p class="login-subtitle">\u6B22\u8FCE\u56DE\u5BB6</p>' +
          '<el-input v-model="password" type="password" placeholder="\u8BF7\u8F93\u5165\u53E3\u4EE4" show-password @keyup.enter="login" size="large" />' +
          '<el-button type="primary" style="width:100%;margin-top:12px;" @click="login" :loading="logging" size="large">\u8FDB\u5165</el-button>' +
          '<p v-if="error" style="color:#f56c6c;margin-top:12px;font-size:13px;">{{ error }}</p>' +
        '</div>' +
      '</div>',
    setup: function () {
      var password = ref('');
      var logging = ref(false);
      var error = ref('');
      function login() {
        if (!password.value) { error.value = '\u8BF7\u8F93\u5165\u53E3\u4EE4'; return; }
        logging.value = true;
        try {
          var decodedToken = xorDecode(CRED_TOKEN, password.value);
          var decodedRepo = xorDecode(CRED_REPO, password.value);
          if (decodedRepo.indexOf('/') < 0) {
            error.value = '\u53E3\u4EE4\u9519\u8BEF';
            logging.value = false;
            return;
          }
          store.githubToken = decodedToken;
          store.githubRepo = decodedRepo;
          localStorage.setItem('home_manager_logged_in', 'true');
          store.loggedIn = true;
        } catch (e) {
          error.value = '\u53E3\u4EE4\u9519\u8BEF';
          logging.value = false;
        }
      }
      return { password: password, logging: logging, error: error, login: login };
    },
  };

  // ==================== 主导航 + 收纳管理 ====================
  var MainApp = {
    template:
      '<div class="main-container">' +
        // ---------- 主菜单 ----------
        '<div v-if="!currentFeature" class="menu-page">' +
          '<div class="menu-header">' +
            '<div class="menu-avatar">\uD83C\uDF3B</div>' +
            '<h1>\u5C0F\u82B1\u4E0E\u5C0F\u98CE</h1>' +
            '<p class="menu-subtitle">\u60A8\u7684\u5BB6\u5EAD\u6570\u5B57\u52A9\u624B</p>' +
          '</div>' +
          '<div class="menu-grid">' +
            '<div class="menu-card" @click="enterFeature(\'storage\')">' +
              '<div class="menu-card-icon">\uD83C\uDFE0</div>' +
              '<div class="menu-card-title">\u5BB6\u5EAD\u6536\u7EB3\u7BA1\u7406</div>' +
              '<div class="menu-card-desc">\u623F\u5B50 \u00B7 \u623F\u95F4 \u00B7 \u6536\u7EB3\u4F4D \u00B7 \u7269\u54C1</div>' +
            '</div>' +
          '</div>' +
          '<div class="menu-footer">' +
            '<el-button text size="small" @click="logout">\u9000\u51FA\u767B\u5F55</el-button>' +
          '</div>' +
        '</div>' +
        // ---------- 收纳管理 ----------
        '<div v-else class="storage-page">' +
          '<div class="s-header">' +
            '<button class="s-back" @click="currentFeature = null">\u2190</button>' +
            '<span>\u5BB6\u5EAD\u6536\u7EB3\u7BA1\u7406</span>' +
            '<div class="s-header-right">' +
              '<button class="s-search-btn" @click="focusSearch">\uD83D\uDD0D</button>' +
              '<button class="s-tree-btn" @click="showMobileTree = true" v-if="isMobileView">\u2630</button>' +
            '</div>' +
          '</div>' +
          '<div class="s-body">' +
            // 搜索栏
            '<div v-if="searchVisible" class="s-search-bar">' +
              '<el-radio-group v-model="searchMode" size="small">' +
                '<el-radio-button value="text">\u5168\u6587</el-radio-button>' +
                '<el-radio-button value="category">\u5206\u7C7B</el-radio-button>' +
                '<el-radio-button value="type">\u7C7B\u578B</el-radio-button>' +
              '</el-radio-group>' +
              '<el-input v-model="searchQuery" placeholder="\u641C\u7D22\u7269\u54C1..." size="small" clearable @keyup.enter="doSearch" style="flex:1;min-width:100px;" />' +
              '<el-button size="small" type="primary" @click="doSearch">\u641C\u7D22</el-button>' +
            '</div>' +
            // 内容区
            '<div class="s-content">' +
              // 搜索结果
              '<div v-if="showSearch" class="search-results">' +
                '<div v-if="searchResults.length === 0" style="color:#909399;text-align:center;padding:40px;">\u672A\u627E\u5230\u5339\u914D\u9879</div>' +
                '<div v-for="r in searchResults" :key="r.item.id" class="search-item" @click="navToSearchResult(r)">' +
                  '<div class="search-name">{{ r.item.name }}</div>' +
                  '<div class="search-path">{{ r.path }}</div>' +
                  '<div class="search-meta"><el-tag size="small">{{ r.item.category || \'\u672A\u5206\u7C7B\' }}</el-tag></div>' +
                '</div>' +
              '</div>' +
              // 物品列表
              '<div v-else-if="selectedContainer" class="item-list">' +
                '<div class="item-list-header">' +
                  '<div class="item-list-path">{{ currentContainerPath }}</div>' +
                  '<el-button size="small" type="primary" @click="showAddItemFromPanel">+ \u6DFB\u52A0</el-button>' +
                '</div>' +
                '<div class="item-grid">' +
                  '<div v-for="item in (selectedContainer.items || [])" :key="item.id" class="item-card">' +
                    '<div class="item-card-name">{{ item.name }}</div>' +
                    '<div class="item-card-meta">' +
                      '<el-tag size="small">{{ item.category || \'-\' }}</el-tag>' +
                      '<span class="item-card-time">{{ formatTime(item.createTime) }}</span>' +
                    '</div>' +
                    '<div v-if="item.remark" class="item-card-remark">{{ item.remark }}</div>' +
                    '<div class="item-card-actions">' +
                      '<el-button size="small" link @click.stop="editItem(item)">\u7F16\u8F91</el-button>' +
                      '<el-button size="small" link type="danger" @click.stop="deleteItem(item)">\u5220\u9664</el-button>' +
                    '</div>' +
                  '</div>' +
                  '<div v-if="!selectedContainer.items || selectedContainer.items.length === 0" class="item-empty">\u8BE5\u6536\u7EB3\u4F4D\u6682\u65E0\u7269\u54C1</div>' +
                '</div>' +
              '</div>' +
              // 空状态
              '<div v-else class="empty-state">' +
                '<div style="font-size:48px;margin-bottom:8px;">\uD83D\uDCE6</div>' +
                '<p>\u8BF7\u4ECE\u5DE6\u4FA7\u6811\u4E2D\u9009\u62E9\u6536\u7EB3\u4F4D</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
          // 树形抽屉 (手机)
          '<el-drawer v-model="showMobileTree" title="\u6536\u7EB3\u7ED3\u6784" size="80%" :with-header="true" v-if="isMobileView">' +
            '<div class="mobile-tree-header">' +
              '<el-button size="small" type="primary" @click="showAddHouse">+ \u623F\u5B50</el-button>' +
            '</div>' +
            '<el-tree ref="treeRef" :data="treeData" node-key="id" :props="{ children: \'children\', label: \'label\' }" :default-expanded-keys="expandedKeys" @node-click="onNodeClickMobile">' +
              '<template #default="{ node, data }">' +
                '<span class="tree-node">' +
                  '<span class="tree-label">{{ data.label }}</span>' +
                  '<span class="tree-actions">' +
                    '<el-button v-if="data.type === \'house\'" size="small" link @click.stop="showAddRoom(data)">+</el-button>' +
                    '<el-button v-if="data.type === \'room\'" size="small" link @click.stop="showAddContainer(data)">+</el-button>' +
                    '<el-button v-if="data.type === \'container\'" size="small" link @click.stop="showAddItemFromTree(data)">+</el-button>' +
                    '<el-button size="small" link @click.stop="editNode(data)">\u6539</el-button>' +
                    '<el-button size="small" link type="danger" @click.stop="deleteNode(data)">\u5220</el-button>' +
                  '</span>' +
                '</span>' +
              '</template>' +
            '</el-tree>' +
          '</el-drawer>' +
          // 桌面侧边树
          '<div v-if="!isMobileView" class="s-sidebar">' +
            '<div class="s-sidebar-header">' +
              '<span>\u6536\u7EB3\u7ED3\u6784</span>' +
              '<el-button size="small" type="primary" @click="showAddHouse">+ \u623F\u5B50</el-button>' +
            '</div>' +
            '<el-tree ref="treeRef" :data="treeData" node-key="id" :props="{ children: \'children\', label: \'label\' }" :default-expanded-keys="expandedKeys" @node-click="onNodeClick" v-loading="store.loading">' +
              '<template #default="{ node, data }">' +
                '<span class="tree-node">' +
                  '<span class="tree-label">{{ data.label }}</span>' +
                  '<span class="tree-actions">' +
                    '<el-button v-if="data.type === \'house\'" size="small" link @click.stop="showAddRoom(data)">+</el-button>' +
                    '<el-button v-if="data.type === \'room\'" size="small" link @click.stop="showAddContainer(data)">+</el-button>' +
                    '<el-button v-if="data.type === \'container\'" size="small" link @click.stop="showAddItemFromTree(data)">+</el-button>' +
                    '<el-button size="small" link @click.stop="editNode(data)">\u6539</el-button>' +
                    '<el-button size="small" link type="danger" @click.stop="deleteNode(data)">\u5220</el-button>' +
                  '</span>' +
                '</span>' +
              '</template>' +
            '</el-tree>' +
          '</div>' +
        '</div>' +
        // ---------- Dialogs ----------
        '<el-dialog v-model="houseDlg.visible" :title="houseDlg.isEdit ? \'\u7F16\u8F91\u623F\u5B50\' : \'\u6DFB\u52A0\u623F\u5B50\'" width="92%" :style="{maxWidth:\'400px\'}" :close-on-click-modal="false">' +
          '<el-form :model="houseDlg.form" label-width="60px">' +
            '<el-form-item label="\u540D\u79F0" required><el-input v-model="houseDlg.form.name" placeholder="\u5982\uFF1A\u671D\u9633\u533A\u81EA\u4F4F\u623F" /></el-form-item>' +
            '<el-form-item label="\u7C7B\u578B">' +
              '<el-select v-model="houseDlg.form.type" filterable allow-create default-first-option placeholder="\u9009\u62E9\u6216\u8F93\u5165" style="width:100%">' +
                '<el-option v-for="t in presets.houseType" :key="t" :label="t" :value="t" />' +
              '</el-select>' +
            '</el-form-item>' +
          '</el-form>' +
          '<template #footer><el-button @click="houseDlg.visible = false">\u53D6\u6D88</el-button><el-button type="primary" @click="saveHouse" :loading="store.loading">\u786E\u8BA4</el-button></template>' +
        '</el-dialog>' +
        '<el-dialog v-model="roomDlg.visible" :title="roomDlg.isEdit ? \'\u7F16\u8F91\u623F\u95F4\' : \'\u6DFB\u52A0\u623F\u95F4\'" width="92%" :style="{maxWidth:\'400px\'}" :close-on-click-modal="false">' +
          '<el-form :model="roomDlg.form" label-width="60px">' +
            '<el-form-item label="\u540D\u79F0" required><el-input v-model="roomDlg.form.name" placeholder="\u5982\uFF1A\u4E3B\u5367" /></el-form-item>' +
            '<el-form-item label="\u7C7B\u578B">' +
              '<el-select v-model="roomDlg.form.type" filterable allow-create default-first-option placeholder="\u9009\u62E9\u6216\u8F93\u5165" style="width:100%">' +
                '<el-option v-for="t in presets.roomType" :key="t" :label="t" :value="t" />' +
              '</el-select>' +
            '</el-form-item>' +
          '</el-form>' +
          '<template #footer><el-button @click="roomDlg.visible = false">\u53D6\u6D88</el-button><el-button type="primary" @click="saveRoom" :loading="store.loading">\u786E\u8BA4</el-button></template>' +
        '</el-dialog>' +
        '<el-dialog v-model="containerDlg.visible" :title="containerDlg.isEdit ? \'\u7F16\u8F91\u6536\u7EB3\u4F4D\' : \'\u6DFB\u52A0\u6536\u7EB3\u4F4D\'" width="92%" :style="{maxWidth:\'400px\'}" :close-on-click-modal="false">' +
          '<el-form :model="containerDlg.form" label-width="60px">' +
            '<el-form-item label="\u540D\u79F0" required><el-input v-model="containerDlg.form.name" placeholder="\u5982\uFF1A\u5DE6\u4FA7\u8863\u67DC" /></el-form-item>' +
            '<el-form-item label="\u7C7B\u578B">' +
              '<el-select v-model="containerDlg.form.type" filterable allow-create default-first-option placeholder="\u9009\u62E9\u6216\u8F93\u5165" style="width:100%">' +
                '<el-option v-for="t in presets.containerType" :key="t" :label="t" :value="t" />' +
              '</el-select>' +
            '</el-form-item>' +
          '</el-form>' +
          '<template #footer><el-button @click="containerDlg.visible = false">\u53D6\u6D88</el-button><el-button type="primary" @click="saveContainer" :loading="store.loading">\u786E\u8BA4</el-button></template>' +
        '</el-dialog>' +
        '<el-dialog v-model="itemDlg.visible" :title="itemDlg.isEdit ? \'\u7F16\u8F91\u7269\u54C1\' : \'\u6DFB\u52A0\u7269\u54C1\'" width="92%" :style="{maxWidth:\'460px\'}" :close-on-click-modal="false">' +
          '<el-form :model="itemDlg.form" label-width="60px">' +
            '<el-form-item label="\u540D\u79F0" required><el-input v-model="itemDlg.form.name" placeholder="\u5982\uFF1A\u51AC\u5B63\u7FBD\u7ED2\u670D" /></el-form-item>' +
            '<el-form-item label="\u5206\u7C7B">' +
              '<el-select v-model="itemDlg.form.category" filterable allow-create default-first-option placeholder="\u9009\u62E9\u6216\u8F93\u5165" style="width:100%">' +
                '<el-option v-for="t in presets.itemCategory" :key="t" :label="t" :value="t" />' +
              '</el-select>' +
            '</el-form-item>' +
            '<el-form-item label="\u5907\u6CE8"><el-input v-model="itemDlg.form.remark" type="textarea" :rows="2" placeholder="\u5982\uFF1A\u5E26\u540A\u724C" /></el-form-item>' +
          '</el-form>' +
          '<template #footer><el-button @click="itemDlg.visible = false">\u53D6\u6D88</el-button><el-button type="primary" @click="saveItem" :loading="store.loading">\u786E\u8BA4</el-button></template>' +
        '</el-dialog>' +
      '</div>',
    setup: function () {
      var presets = PRESETS;
      var currentFeature = ref(null);
      var isMobileView = ref(isMobile());
      var treeRef = ref(null);
      var expandedKeys = ref([]);
      var selectedContainerId = ref(null);
      var searchMode = ref('text');
      var searchQuery = ref('');
      var searchResults = ref([]);
      var showSearch = ref(false);
      var searchVisible = ref(false);
      var showMobileTree = ref(false);

      var resizeHandler = function () { isMobileView.value = isMobile(); };
      if (window.addEventListener) {
        window.addEventListener('resize', resizeHandler);
      }

      var houseDlg = reactive({ visible: false, isEdit: false, form: { name: '', type: '' }, editId: null });
      var roomDlg = reactive({ visible: false, isEdit: false, form: { name: '', type: '' }, editId: null, parentHouse: null });
      var containerDlg = reactive({ visible: false, isEdit: false, form: { name: '', type: '' }, editId: null, parentRoom: null });
      var itemDlg = reactive({ visible: false, isEdit: false, form: { name: '', category: '', remark: '' }, editItemData: null, parentContainer: null });

      var treeData = computed(function () { return buildTreeData(store.houses); });
      var selectedContainer = computed(function () {
        if (!selectedContainerId.value) return null;
        return findContainerById(store.houses, selectedContainerId.value);
      });
      var currentContainerPath = computed(function () {
        if (!selectedContainerId.value) return '';
        return getContainerPath(store.houses, selectedContainerId.value);
      });

      // ---- 生命周期 ----
      onMounted(function () {
        store.loading = true;
        fetchData().then(function () {
          store.loading = false;
        }).catch(function () {
          store.loading = false;
        });
      });

      // ---- 功能入口 ----
      function enterFeature(name) {
        currentFeature.value = name;
        if (name === 'storage') {
          fetchData();
        }
      }

      // ---- 搜索 ----
      function focusSearch() {
        searchVisible.value = !searchVisible.value;
        if (!searchVisible.value) { showSearch.value = false; searchQuery.value = ''; }
      }
      function doSearch() {
        if (!searchQuery.value) { searchResults.value = []; showSearch.value = false; return; }
        searchResults.value = searchData(store.houses, searchQuery.value, searchMode.value);
        showSearch.value = true;
      }
      function navToSearchResult(r) {
        selectedContainerId.value = r.container.id;
        showSearch.value = false;
        searchVisible.value = false;
        searchQuery.value = '';
        var tid = 'c-' + r.container.id;
        expandedKeys.value = findTreeParents(treeData.value, tid);
        nextTick(function () { if (treeRef.value) treeRef.value.setCurrentKey(tid); });
      }

      // ---- 树节点点击 ----
      function onNodeClick(data) {
        if (data.type === 'container') { selectedContainerId.value = data.origId; showSearch.value = false; searchVisible.value = false; }
      }
      function onNodeClickMobile(data) {
        onNodeClick(data);
        if (data.type === 'container') showMobileTree.value = false;
      }

      // ---- House ----
      function showAddHouse() { houseDlg.isEdit = false; houseDlg.editId = null; houseDlg.form = { name: '', type: '' }; houseDlg.visible = true; }
      function saveHouse() {
        if (!houseDlg.form.name) { ElementPlus.ElMessage.warning('请输入名称'); return; }
        if (houseDlg.isEdit) {
          for (var i = 0; i < store.houses.length; i++) { if (store.houses[i].id === houseDlg.editId) { store.houses[i].name = houseDlg.form.name; store.houses[i].type = houseDlg.form.type; break; } }
        } else {
          store.houses.push({ id: genId(), name: houseDlg.form.name, type: houseDlg.form.type || 'apartment', rooms: [] });
        }
        houseDlg.visible = false; saveToGitHub();
      }

      // ---- Room ----
      function showAddRoom(treeHouseNode) { roomDlg.isEdit = false; roomDlg.editId = null; roomDlg.parentHouse = treeHouseNode.data; roomDlg.form = { name: '', type: '' }; roomDlg.visible = true; }
      function saveRoom() {
        if (!roomDlg.form.name) { ElementPlus.ElMessage.warning('请输入名称'); return; }
        if (!roomDlg.parentHouse) { ElementPlus.ElMessage.error('未指定所属房子'); return; }
        if (roomDlg.isEdit) {
          var rooms = roomDlg.parentHouse.rooms || [];
          for (var i = 0; i < rooms.length; i++) { if (rooms[i].id === roomDlg.editId) { rooms[i].name = roomDlg.form.name; rooms[i].type = roomDlg.form.type; break; } }
        } else {
          if (!roomDlg.parentHouse.rooms) roomDlg.parentHouse.rooms = [];
          roomDlg.parentHouse.rooms.push({ id: genId(), name: roomDlg.form.name, type: roomDlg.form.type || 'bedroom', containers: [] });
        }
        roomDlg.visible = false; saveToGitHub();
      }

      // ---- Container ----
      function showAddContainer(treeRoomNode) { containerDlg.isEdit = false; containerDlg.editId = null; containerDlg.parentRoom = treeRoomNode.data; containerDlg.form = { name: '', type: '' }; containerDlg.visible = true; }
      function saveContainer() {
        if (!containerDlg.form.name) { ElementPlus.ElMessage.warning('请输入名称'); return; }
        if (!containerDlg.parentRoom) { ElementPlus.ElMessage.error('未指定所属房间'); return; }
        if (containerDlg.isEdit) {
          var containers = containerDlg.parentRoom.containers || [];
          for (var i = 0; i < containers.length; i++) { if (containers[i].id === containerDlg.editId) { containers[i].name = containerDlg.form.name; containers[i].type = containerDlg.form.type; break; } }
        } else {
          if (!containerDlg.parentRoom.containers) containerDlg.parentRoom.containers = [];
          containerDlg.parentRoom.containers.push({ id: genId(), name: containerDlg.form.name, type: containerDlg.form.type || 'wardrobe', items: [] });
        }
        containerDlg.visible = false; saveToGitHub();
      }

      // ---- Item ----
      function showAddItemFromTree(treeContainerNode) { itemDlg.isEdit = false; itemDlg.editItemData = null; itemDlg.parentContainer = treeContainerNode.data; itemDlg.form = { name: '', category: '', remark: '' }; itemDlg.visible = true; }
      function showAddItemFromPanel() { if (!selectedContainer.value) return; itemDlg.isEdit = false; itemDlg.editItemData = null; itemDlg.parentContainer = selectedContainer.value; itemDlg.form = { name: '', category: '', remark: '' }; itemDlg.visible = true; }
      function saveItem() {
        if (!itemDlg.form.name) { ElementPlus.ElMessage.warning('请输入物品名称'); return; }
        if (!itemDlg.parentContainer) { ElementPlus.ElMessage.error('未指定所属收纳位'); return; }
        if (itemDlg.isEdit && itemDlg.editItemData) {
          itemDlg.editItemData.name = itemDlg.form.name;
          itemDlg.editItemData.category = itemDlg.form.category;
          itemDlg.editItemData.remark = itemDlg.form.remark;
        } else {
          if (!itemDlg.parentContainer.items) itemDlg.parentContainer.items = [];
          itemDlg.parentContainer.items.push({ id: genId(), name: itemDlg.form.name, category: itemDlg.form.category || '', remark: itemDlg.form.remark || '', createTime: Date.now() });
        }
        itemDlg.visible = false; saveToGitHub();
      }
      function editItem(item) { itemDlg.isEdit = true; itemDlg.editItemData = item; itemDlg.parentContainer = selectedContainer.value; itemDlg.form = { name: item.name, category: item.category || '', remark: item.remark || '' }; itemDlg.visible = true; }
      function deleteItem(item) {
        ElementPlus.ElMessageBox.confirm('确定删除「' + item.name + '」吗？', '确认删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
          .then(function () { var c = selectedContainer.value; if (c && c.items) { removeById(c.items, item.id); saveToGitHub(); } })
          .catch(function () {});
      }

      // ---- 通用编辑/删除树节点 ----
      function editNode(treeDataNode) {
        if (treeDataNode.type === 'house') {
          var h = treeDataNode.data;
          houseDlg.isEdit = true; houseDlg.editId = h.id; houseDlg.form = { name: h.name, type: h.type || '' }; houseDlg.visible = true;
        } else if (treeDataNode.type === 'room') {
          var r = treeDataNode.data;
          for (var i = 0; i < store.houses.length; i++) {
            var house = store.houses[i];
            for (var j = 0; j < (house.rooms || []).length; j++) {
              if (house.rooms[j].id === r.id) { roomDlg.isEdit = true; roomDlg.editId = r.id; roomDlg.parentHouse = house; roomDlg.form = { name: r.name, type: r.type || '' }; roomDlg.visible = true; return; }
            }
          }
        } else if (treeDataNode.type === 'container') {
          var c = treeDataNode.data;
          for (var hi = 0; hi < store.houses.length; hi++) {
            for (var ri = 0; ri < (store.houses[hi].rooms || []).length; ri++) {
              for (var ci = 0; ci < (store.houses[hi].rooms[ri].containers || []).length; ci++) {
                if (store.houses[hi].rooms[ri].containers[ci].id === c.id) { containerDlg.isEdit = true; containerDlg.editId = c.id; containerDlg.parentRoom = store.houses[hi].rooms[ri]; containerDlg.form = { name: c.name, type: c.type || '' }; containerDlg.visible = true; return; }
              }
            }
          }
        }
      }

      function deleteNode(treeDataNode) {
        ElementPlus.ElMessageBox.confirm('确定删除「' + treeDataNode.label + '」及其所有子级吗？', '确认删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
          .then(function () {
            if (treeDataNode.type === 'house') { removeById(store.houses, treeDataNode.origId); }
            else if (treeDataNode.type === 'room') { for (var i = 0; i < store.houses.length; i++) { if (removeById(store.houses[i].rooms || [], treeDataNode.origId)) break; } }
            else if (treeDataNode.type === 'container') { for (var hi = 0; hi < store.houses.length; hi++) { for (var ri = 0; ri < (store.houses[hi].rooms || []).length; ri++) { if (removeById(store.houses[hi].rooms[ri].containers || [], treeDataNode.origId)) break; } } }
            if (selectedContainerId.value === treeDataNode.origId) selectedContainerId.value = null;
            saveToGitHub();
          }).catch(function () {});
      }

      function logout() {
        localStorage.removeItem('home_manager_logged_in');
        store.loggedIn = false;
        store.githubToken = '';
        store.githubRepo = '';
      }

      // 清理事件监听
      onMounted(function () {
        // already handled from fetchData
      });

      return {
        store: store, presets: presets, currentFeature: currentFeature, isMobileView: isMobileView,
        treeRef: treeRef, expandedKeys: expandedKeys, selectedContainerId: selectedContainerId,
        searchMode: searchMode, searchQuery: searchQuery, searchResults: searchResults, showSearch: showSearch, searchVisible: searchVisible,
        showMobileTree: showMobileTree,
        treeData: treeData, selectedContainer: selectedContainer, currentContainerPath: currentContainerPath,
        houseDlg: houseDlg, roomDlg: roomDlg, containerDlg: containerDlg, itemDlg: itemDlg,
        enterFeature: enterFeature, focusSearch: focusSearch,
        onNodeClick: onNodeClick, onNodeClickMobile: onNodeClickMobile,
        doSearch: doSearch, navToSearchResult: navToSearchResult,
        showAddHouse: showAddHouse, saveHouse: saveHouse,
        showAddRoom: showAddRoom, saveRoom: saveRoom,
        showAddContainer: showAddContainer, saveContainer: saveContainer,
        showAddItemFromTree: showAddItemFromTree, showAddItemFromPanel: showAddItemFromPanel, saveItem: saveItem,
        editItem: editItem, deleteItem: deleteItem,
        editNode: editNode, deleteNode: deleteNode,
        formatTime: formatTime, logout: logout,
      };
    },
  };

  // ==================== 启动 ====================
  var app = VueApp({
    template: '<LoginGate v-if="!store.loggedIn" /><MainApp v-else />',
    setup: function () { return { store: store }; },
  });

  app.component('LoginGate', LoginGate);
  app.component('MainApp', MainApp);
  app.use(ElementPlus);

  if (typeof ElementPlusIconsVue !== 'undefined') {
    for (var key in ElementPlusIconsVue) {
      if (Object.prototype.hasOwnProperty.call(ElementPlusIconsVue, key)) { app.component(key, ElementPlusIconsVue[key]); }
    }
  }

  app.mount('#app');
})();
