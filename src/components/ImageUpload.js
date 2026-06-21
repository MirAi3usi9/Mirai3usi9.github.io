import { compressImageToWebP } from '../utils/helpers.js';

export default {
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
