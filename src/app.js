import { store } from './store.js';
import LoginGate from './components/LoginGate.js';
import MainApp from './components/MainApp.js';
import CardNode from './components/CardNode.js';
import TagInput from './components/TagInput.js';
import ImageUpload from './components/ImageUpload.js';
import ListManager from './components/ListManager.js';

const { createApp } = Vue;

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
