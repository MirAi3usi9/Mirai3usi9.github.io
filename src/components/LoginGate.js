import { store, loadUseGitHubSetting } from '../store.js';
import { xorDecode, CRED_TOKEN, CRED_REPO } from '../utils/crypto.js';

const { ref } = Vue;

export default {
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
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.indexOf('xiaohua_xiaofeng_') === 0) keysToRemove.push(key);
      }
      keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
      ElementPlus.ElMessage.success('缓存已清除，即将强制刷新');
      setTimeout(function() { location.href = location.href.split('?')[0] + '?_cache=' + Date.now(); }, 1000);
    }
    return { password, logging, error, login, clearLocalData };
  },
};
