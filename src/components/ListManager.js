export default {
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
