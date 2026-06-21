import { store, markDirty } from '../store.js';
import { genId } from '../utils/helpers.js';

export default {
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
