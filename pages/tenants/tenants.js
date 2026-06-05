const api = require('../../utils/api');
Page({
  data: {
    refreshing: false, keyword: '', list: [], allTenants: [],
    // 编辑弹窗
    showEdit: false,
    editId: null,
    editName: '', editPhone: '', editRent: '', editPayment: '',
    editContractEnd: '', editContractStart: '', editDeposit: '', editNotes: '',
    properties: [],
    editPropertyId: '',
    editPropertyIdx: 0,
    editPropertyName: '',
    paymentTypes: ['月付', '季付', '半年付', '年付', '托管']
  },

  onLoad(opts) {
    const app = getApp();
    this._pendingSearch = (app.globalData.tenantSearch || opts.search || '');
    app.globalData.tenantSearch = '';
  },

  onShow() { this.loadData(); },

  onRefresh() { this.setData({ refreshing: true }); this.loadData().then(() => this.setData({ refreshing: false })); },

  async loadData() {
    try {
      const [tRes, pRes] = await Promise.all([
        api.get('/tenants?page=1&pageSize=100'),
        api.get('/properties/my?page=1&pageSize=100')
      ]);
      const tenants = tRes.data?.list || [];
      const props = pRes.data?.list || [];
      let propMap = {};
      props.forEach(p => propMap[p.id] = p.name);
      this.setData({ properties: props });
      
      const allTenants = tenants.map(t => ({
        ...t,
        property_name: propMap[t.property_id] || '未分配房源'
      }));
      
      this.setData({ allTenants });
      if (this._pendingSearch) {
        this.setData({ keyword: this._pendingSearch });
        this._pendingSearch = '';
        this.filterByKw(this.data.keyword);
      } else {
        this.filter();
      }
    } catch(e) { console.error(e); }
  },

  onSearch(e) { this.setData({ keyword: e.detail.value }); this.filter(); },
  filter() { this.filterByKw(this.data.keyword); },

  filterByKw(kw) {
    this.setData({
      list: this.data.allTenants.filter(t =>
        !kw || (t.name||'').includes(kw) || (t.phone||'').includes(kw) || (t.property_name||'').includes(kw)
      )
    });
  },

  addTenant() {
    this.setData({
      showEdit: true,
      editId: null,
      editName: '', editPhone: '', editRent: '', editPayment: '月付',
      editContractEnd: '', editContractStart: '', editDeposit: '', editNotes: '',
      editPropertyId: '', editPropertyIdx: 0, editPropertyName: ''
    });
  },

  // ---- 编辑租客 ----
  editTenant(e) {
    const t = this.data.allTenants.find(item => item.id === e.currentTarget.dataset.id);
    if (!t) return;
    this.setData({
      showEdit: true,
      editId: t.id,
      editName: t.name || '',
      editPhone: t.phone || '',
      editRent: String(t.rent_amount || ''),
      editPayment: t.payment_type || '月付',
      editContractStart: t.contract_start ? t.contract_start.slice(0,10) : '',
      editContractEnd: t.contract_end ? t.contract_end.slice(0,10) : '',
      editDeposit: String(t.deposit || ''),
      editNotes: t.remark || t.notes || '',
      editPropertyId: String(t.property_id || ''),
      editPropertyIdx: t.property_id ? this.data.properties.findIndex(p => String(p.id) === String(t.property_id)) : 0,
      editPropertyName: t.property_name || (t.property_id ? this.data.properties.find(p => String(p.id) === String(t.property_id))?.name || '' : '')
    });
  },

  closeEdit() { this.setData({ showEdit: false }); },

  onEditField(e) {
    const f = e.currentTarget.dataset.f;
    this.setData({ ['edit' + f]: e.detail.value });
  },

  onEditPropChange(e) {
    const idx = e.detail.value;
    const prop = this.data.properties[idx];
    this.setData({ editPropertyId: prop ? String(prop.id) : '', editPropertyIdx: idx, editPropertyName: prop ? prop.name : '' });
  },

  onEditPaymentChange(e) {
    const types = this.data.paymentTypes;
    this.setData({ editPayment: types[e.detail.value] || '月付' });
  },

  async saveEdit() {
    if (!this.data.editName) {
      wx.showToast({ title: '请输入租客姓名', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    try {
      const data = {
        name: this.data.editName,
        phone: this.data.editPhone,
        rent_amount: parseFloat(this.data.editRent) || 0,
        payment_type: this.data.editPayment,
        property_id: parseInt(this.data.editPropertyId) || null,
        deposit: parseFloat(this.data.editDeposit) || 0,
        notes: this.data.editNotes
      };
      if (this.data.editContractStart) data.contract_start = this.data.editContractStart;
      if (this.data.editContractEnd) data.contract_end = this.data.editContractEnd;

      const isAdd = !this.data.editId;
      const res = isAdd ? await api.post('/tenants', data) : await api.put('/tenants/' + this.data.editId, data);
      if (res.code === 0) {
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.setData({ showEdit: false });
        this.loadData();
      } else {
        wx.hideLoading();
        wx.showToast({ title: res.msg || '保存失败', icon: 'none' });
      }
    } catch(e) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // ---- 删除租客 ----
  delTenant(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该租客吗？',
      success: async (r) => {
        if (r.confirm) {
          try {
            const res = await api.del('/tenants/' + id);
            if (res.code === 0) { wx.showToast({ title: '已删除', icon: 'success' }); this.loadData(); }
          } catch(e) { wx.showToast({ title: '删除失败', icon: 'none' }); }
        }
      }
    });
  }
});
