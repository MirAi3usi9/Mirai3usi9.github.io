import { getChildren } from '../utils/helpers.js';
import { getIcon, getEntityTypeName, getTypeLabel } from '../utils/helpers.js';

const { computed } = Vue;

export default {
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
    return { icon, typeLabel, isExpanded, childNodes, tagType, visibleTags, previewLimit, previewChildren, onToggle, onCardClick, previewImage, getIcon, getEntityTypeName };
  },
};
