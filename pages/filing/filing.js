const api = require('../../utils/api');
const app = getApp();
Page({
  data: {
    tenants: [], filteredTenants: [],
    contractStats: { active: 0, expiring: 0, expired: 0 },
    activeFilter: 'all',
    properties: [],
    // 新建合同弹窗
    showAdd: false,
    formPropId: '', formPropName: '',
    formTenant: '', formPhone: '', formRent: '',
    formPayment: '月付', formStart: '', formEnd: '', formDeposit: '',
    // AI生成弹窗
    showAI: false, aiResult: '', aiLoading: false,
    paymentTypes: ['月付', '季付', '半年付', '年付']
  },

  onShow() { this.loadData(); },

  async loadData() {
    try {
      const [tRes, pRes] = await Promise.all([
        api.get('/tenants?page=1&pageSize=100'),
        api.get('/properties/my?page=1&pageSize=100')
      ]);
      const tenants = tRes.data?.list || [];
      const props = pRes.data?.list || [];
      this.setData({ properties: props });
      const propMap = {};
      props.forEach(p => propMap[p.id] = p.name);

      const now = new Date();
      let active = 0, expiring = 0, expired = 0;
      tenants.forEach(t => {
        t.property_name = propMap[t.property_id] || '未分配房源';
        if (!t.contract_end) { active++; t.contractStatus = 'active'; t.contractStatusText = '进行中'; return; }
        const end = new Date(t.contract_end);
        const days = Math.ceil((end - now) / 86400000);
        if (days > 30) { active++; t.contractStatus = 'active'; t.contractStatusText = '进行中'; }
        else if (days > 0) { expiring++; t.contractStatus = 'expiring'; t.contractStatusText = days + '天后到期'; }
        else { expired++; t.contractStatus = 'expired'; t.contractStatusText = '已到期' + Math.abs(days) + '天'; }
      });
      this.setData({ tenants, contractStats: { active, expiring, expired } });
      this.applyFilter();
    } catch(e) { console.error(e); }
  },

  onFilter(e) { this.setData({ activeFilter: e.currentTarget.dataset.status || 'all' }); this.applyFilter(); },
  applyFilter() {
    const s = this.data.activeFilter;
    this.setData({ filteredTenants: s === 'all' ? this.data.tenants : this.data.tenants.filter(t => t.contractStatus === s) });
  },

  viewContract(e) {
    const t = this.data.tenants.find(i => i.id === e.currentTarget.dataset.id);
    if (t && t.property_id) wx.navigateTo({ url: '/pages/property-detail/property-detail?id=' + t.property_id });
    else wx.showToast({ title: '该合同未关联房源', icon: 'none' });
  },

  // ---- 新建合同 ----
  addContract() {
    this.setData({ showAdd: true, formPropId: '', formPropName: '', formTenant: '', formPhone: '',
      formRent: '', formPayment: '月付', formStart: '', formEnd: '', formDeposit: '' });
  },
  closeAdd() { this.setData({ showAdd: false }); },
  onFormField(e) { const f = e.currentTarget.dataset.f; this.setData({ [f]: e.detail.value }); },
  onFormProp(e) {
    const p = this.data.properties[e.detail.value];
    if (p) this.setData({ formPropId: String(p.id), formPropName: p.name });
  },
  onFormPayment(e) { this.setData({ formPayment: this.data.paymentTypes[e.detail.value] || '月付' }); },
  async doAddContract() {
    const { formTenant, formPropId, formRent } = this.data;
    if (!formTenant || !formPropId || !formRent) {
      wx.showToast({ title: '请填写租客姓名、房源和租金', icon: 'none' }); return;
    }
    wx.showLoading({ title: '创建中...' });
    try {
      // 使用tenants POST端点创建租客（含合同信息）
      const res = await api.post('/tenants', {
        name: formTenant, phone: this.data.formPhone,
        property_id: parseInt(formPropId),
        rent_amount: parseFloat(formRent),
        payment_type: this.data.formPayment,
        contract_start: this.data.formStart || null,
        contract_end: this.data.formEnd || null,
        deposit: parseFloat(this.data.formDeposit) || 0
      });
      if (res.code === 0) {
        wx.hideLoading();
        wx.showToast({ title: '合同创建成功', icon: 'success' });
        this.setData({ showAdd: false });
        this.loadData();
      } else {
        wx.hideLoading();
        wx.showToast({ title: res.msg || '创建失败', icon: 'none' });
      }
    } catch(e) { wx.hideLoading(); wx.showToast({ title: '创建失败', icon: 'none' }); }
  },

  // ---- AI生成合同 ----
  async aiGenerate() {
    if (!this.data.properties.length || !this.data.tenants.length) {
      wx.showToast({ title: '请先添加房源和租客', icon: 'none' }); return;
    }
    this.setData({ showAI: true, aiResult: '', aiLoading: false });
  },
  closeAI() { this.setData({ showAI: false }); },
  async doAiGenerate() {
    const user = app.globalData.userInfo;
    const prop = this.data.properties[0]; // 默认第一个房源
    const t = this.data.tenants[0];
    if (!prop || !t) { wx.showToast({ title: '请先添加房源和租客', icon: 'none' }); return; }
    this.setData({ aiLoading: true });
    try {
      const res = await api.post('/ai/generate-contract', {
        landlord_name: user?.nickname || user?.phone || '房东',
        landlord_phone: user?.phone || '',
        tenant_name: t.name || '租客',
        tenant_phone: t.phone || '',
        property_address: prop.name || prop.address || '',
        city: prop.city || '',
        district: prop.district || '',
        community: prop.community || '',
        room: prop.room, hall: prop.hall, area: prop.area,
        rent_amount: t.rent_amount || prop.rent || 0,
        payment_type: t.payment_type || '月付',
        deposit: t.deposit || 0,
        contract_start: t.contract_start || '',
        contract_end: t.contract_end || ''
      });
      if (res.code === 0) {
        this.setData({ aiResult: res.data?.contract || res.data || '生成成功', aiLoading: false });
      } else {
        this.setData({ aiResult: res.msg || '生成失败，请重试', aiLoading: false });
      }
    } catch(e) {
      this.setData({ aiResult: '网络错误，请重试', aiLoading: false });
    }
  },

  // ---- 续签 ----
  renewContract(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '续签合同',
      content: '是否续签该租客的合同？到期日将延长一年',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const t = this.data.tenants.find(t => t.id === id);
          if (!t || !t.contract_end) return;
          const oldEnd = new Date(t.contract_end);
          const newEnd = new Date(oldEnd.getFullYear() + 1, oldEnd.getMonth(), oldEnd.getDate());
          const r = await api.put('/tenants/' + id, { contract_end: newEnd.toISOString().slice(0, 10) });
          if (r.code === 0) { wx.showToast({ title: '续签成功', icon: 'success' }); this.loadData(); }
        } catch(e) { wx.showToast({ title: '续签失败', icon: 'none' }); }
      }
    });
  }
});
