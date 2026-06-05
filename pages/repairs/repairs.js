const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    list: [],
    refreshing: false,
    // 报修弹窗
    showAdd: false,
    properties: [],
    formPropertyId: '',
    formDesc: '',
    formTenantName: '',
    formTenantPhone: '',
    isSubmitting: false,
    // AI诊断结果
    showDiagnosis: false,
    diagnosis: null,
    repairId: null,
    providerName: '',
    providerCost: '',
    // 列表筛选
    filterStatus: 'all'
  },

  onShow() { this.loadData(); },

  async loadData() {
    try {
      const res = await api.get('/repairs?page=1&pageSize=50');
      const items = res.data || [];
      // 加载房源名称
      let propMap = {};
      try {
        const pRes = await api.get('/properties/my?page=1&pageSize=100');
        const props = pRes.data?.list || [];
        props.forEach(p => propMap[p.id] = p.name);
      } catch(e) {}
      items.forEach(r => {
        r.property_name = propMap[r.property_id] || '#' + r.property_id;
        r._statusText = r.status === 'diagnosing' ? '诊断中' : r.status === 'diagnosed' ? '待处理' : r.status === 'completed' ? '已完成' : r.status;
        r._urgencyClass = r.ai_urgency === '紧急' ? 'urgency-danger' : r.ai_urgency === '加急' ? 'urgency-warn' : 'urgency-normal';
        r._time = (r.created_at || '').slice(0, 16);
      });
      this.setData({ list: items });
    } catch(e) { console.error(e); }
  },

  onRefresh() { this.setData({ refreshing: true }); this.loadData().then(() => this.setData({ refreshing: false })); },

  // ---- 筛选 ----
  filterBy(e) {
    this.setData({ filterStatus: e.currentTarget.dataset.status || 'all' });
  },

  get filteredList() {
    const s = this.data.filterStatus;
    return s === 'all' ? this.data.list : this.data.list.filter(r => r.status === s);
  },

  // ---- 打开报修弹窗 ----
  async openAdd() {
    // 加载房源列表供选择
    try {
      const pRes = await api.get('/properties/my?page=1&pageSize=100');
      const props = pRes.data?.list || [];
      this.setData({ properties: props, showAdd: true, formPropertyId: '', formPropName: '', formDesc: '', formTenantName: '', formTenantPhone: '' });
    } catch(e) { wx.showToast({ title: '加载房源失败', icon: 'none' }); }
  },

  closeAdd() { this.setData({ showAdd: false, showDiagnosis: false }); },

  onPropChange(e) {
    const idx = e.detail.value;
    const prop = this.data.properties[idx];
    this.setData({ formPropertyId: prop ? prop.id : '', formPropName: prop ? prop.name : '' });
  },
  onDescInput(e) { this.setData({ formDesc: e.detail.value }); },
  onTenantInput(e) { this.setData({ formTenantName: e.detail.value }); },
  onPhoneInput(e) { this.setData({ formTenantPhone: e.detail.value }); },

  async submitRepair() {
    const desc = this.data.formDesc.trim();
    if (!desc || desc.length < 3) {
      wx.showToast({ title: '请描述问题（至少3个字）', icon: 'none' });
      return;
    }
    this.setData({ isSubmitting: true });
    try {
      // 找到选中房源的 city
      const prop = this.data.properties.find(p => String(p.id) === String(this.data.formPropertyId));
      const city = prop ? (prop.city || '上海') : '上海';
      const res = await api.post('/repairs', {
        property_id: this.data.formPropertyId || undefined,
        tenant_name: this.data.formTenantName,
        tenant_phone: this.data.formTenantPhone,
        issue_description: desc,
        city
      });
      if (res.success || res.code === 0) {
        const diag = res.diagnosis || { category: '其他', urgency: '待定', probable_causes: [], cost_range: { min: 0, max: 0 } };
        // 显示AI诊断结果
        this.setData({
          showAdd: false,
          isSubmitting: false,
          showDiagnosis: true,
          diagnosis: diag,
          diagCostMin: diag.cost_range?.min || 0,
          diagCostMax: diag.cost_range?.max || 0,
          repairId: res.repair_id,
          providerName: '',
          providerCost: ''
        });
        this.loadData();
      } else {
        wx.showToast({ title: res.error || res.msg || '提交失败', icon: 'none' });
        this.setData({ isSubmitting: false });
      }
    } catch(e) {
      wx.showToast({ title: '提交失败', icon: 'none' });
      this.setData({ isSubmitting: false });
    }
  },

  // ---- 查看详情 ----
  async viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const res = await api.get('/repairs/' + id);
      if (res.success) {
        const d = res.data;
        let diag = {};
        try { diag = JSON.parse(d.ai_diagnosis || '{}'); } catch(e) {}
        let providers = [];
        try { providers = JSON.parse(d.recommended_providers || '[]'); } catch(e) {}
        this.setData({
          showDiagnosis: true,
          diagnosis: {
            category: d.repair_category || diag.category,
            urgency: d.ai_urgency || diag.urgency,
            probable_causes: (diag.probable_causes || []).slice(0, 3),
            cost_range: { min: d.ai_price_min, max: d.ai_price_max },
            pitfall_warning: diag.rip_off_warning || diag.pitfall_warning || ''
          },
          diagCostMin: d.ai_price_min || 0,
          diagCostMax: d.ai_price_max || 0,
          repairId: d.id,
          providerName: d.actual_provider || '',
          providerCost: d.actual_cost || ''
        });
      }
    } catch(e) { wx.showToast({ title: '加载失败', icon: 'none' }); }
  },

  closeDiagnosis() { this.setData({ showDiagnosis: false }); },

  // ---- 标记完成 ----
  async doComplete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '完成报修',
      content: '确认该维修已完成？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const r = await api.post('/repairs/' + id + '/complete');
          if (r.success || r.code === 0) {
            wx.showToast({ title: '已标记完成', icon: 'success' });
            this.loadData();
          }
        } catch(e) { wx.showToast({ title: '操作失败', icon: 'none' }); }
      }
    });
  },

  // ---- 记录实际费用 ----
  async saveActual() {
    if (!this.data.repairId) return;
    try {
      await api.post('/repairs/' + this.data.repairId + '/complete', {
        actual_cost: parseFloat(this.data.providerCost) || 0,
        actual_provider: this.data.providerName
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ showDiagnosis: false });
      this.loadData();
    } catch(e) { wx.showToast({ title: '保存失败', icon: 'none' }); }
  },

  onProviderName(e) { this.setData({ providerName: e.detail.value }); },
  onProviderCost(e) { this.setData({ providerCost: e.detail.value }); },

  // ---- 跳转 ----
  goBack() { wx.navigateBack(); }
});
