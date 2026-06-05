const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    refreshing: false, keyword: '',
    list: [], allBills: [],
    totalIncome: 0, totalPaid: 0, totalPending: 0,
    totalIncomeStr: '0', totalPaidStr: '0', totalPendingStr: '0',
    showAdd: false,
    showEdit: false,  // 编辑弹窗
    editItem: null, editAmount: '', editMonth: '', editStatus: '',
    addProperties: []
  },

  onLoad() {
    if (app.globalData.billSearch) {
      this._pendingSearch = app.globalData.billSearch;
      app.globalData.billSearch = '';
    }
    // 如果有月份筛选
    if (app.globalData.billMonthFilter) {
      this._pendingMonthFilter = app.globalData.billMonthFilter;
      app.globalData.billMonthFilter = '';
    }
  },

  onShow() { this.loadData(); },
  onRefresh() { this.setData({ refreshing: true }); this.loadData().then(() => this.setData({ refreshing: false })); },

  async loadData() {
    try {
      const res = await api.get('/bills?page=1&pageSize=2000');
      const raw = res.data?.list || [];
      const allBills = raw.map(b => ({
        ...b,
        amountNum: Number(b.amount) || 0,
        amountStr: '¥' + (Number(b.amount) || 0).toLocaleString(),
        monthDisplay: (b.bill_date || '').substring(0, 7) || '-'
      }));

      let keyword = this.data.keyword;
      if (this._pendingSearch) {
        keyword = this._pendingSearch;
        this._pendingSearch = '';
      }
      // 如果有月份筛选，叠加搜索
      if (this._pendingMonthFilter) {
        const mf = this._pendingMonthFilter;
        this._pendingMonthFilter = '';
        // 将月份筛选设为keyword（因为月份在monthDisplay里）
        setTimeout(() => {
          this.setData({ keyword: mf });
          this.filterWithKw(allBills, mf);
        }, 100);
      }

      const filtered = keyword
        ? allBills.filter(b => (b.property_name || '').includes(keyword) || (b.monthDisplay || '').includes(keyword))
        : allBills;

      const totalIncome = filtered.reduce((s, b) => s + b.amountNum, 0);
      const totalPaid = filtered.filter(b => b.status === 'paid').reduce((s, b) => s + b.amountNum, 0);
      const totalPending = filtered.filter(b => b.status === 'pending').reduce((s, b) => s + b.amountNum, 0);

      this.setData({
        allBills, list: filtered,
        totalIncome, totalPaid, totalPending,
        totalIncomeStr: '¥' + totalIncome.toLocaleString(),
        totalPaidStr: '¥' + totalPaid.toLocaleString(),
        totalPendingStr: '¥' + totalPending.toLocaleString(),
        keyword
      });
    } catch (e) { console.error(e); }
  },

  filterWithKw(allBills, kw) {
    this.setData({
      list: allBills.filter(b =>
        !kw || (b.property_name || '').includes(kw) || (b.monthDisplay || '').includes(kw)
      ),
      keyword: kw
    });
  },

  onSearch(e) { this.setData({ keyword: e.detail.value }); this.filter(); },

  filter() {
    const kw = this.data.keyword;
    this.setData({
      list: this.data.allBills.filter(b =>
        !kw || (b.property_name || '').includes(kw) || (b.monthDisplay || '').includes(kw)
      )
    });
  },

  // ======== 记一笔 ========
  async addBill() {
    await this.loadProperties();
    this.setData({
      showAdd: true, addPropId: '', addAmount: '', addMonth: '', addTenant: '',
      addPropName: '', addPropRent: 0
    });
  },

  async loadProperties() {
    try {
      const pRes = await api.get('/properties/my?page=1&pageSize=100');
      const props = pRes.data?.list || [];
      // 同时加载租客信息以获取合同租金
      const tRes = await api.get('/tenants?page=1&pageSize=100');
      const tenants = tRes.data?.list || [];
      // 为每个房源标记当前租客和租金
      const enriched = props.map(p => {
        const tenant = tenants.find(t => t.property_id === p.id);
        return { ...p, tenantName: tenant ? tenant.name : '', rentAmount: tenant ? (tenant.rent_amount || p.rent) : p.rent };
      });
      this.setData({ addProperties: enriched });
    } catch (e) {}
  },

  nowMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },

  closeAdd() { this.setData({ showAdd: false, showEdit: false }); },

  onAddPropChange(e) {
    const idx = e.detail.value;
    const prop = this.data.addProperties[idx];
    if (prop) {
      const defaultRent = prop.rentAmount || prop.rent || 0;
      this.setData({
        addPropId: prop.id,
        addPropName: prop.name,
        addAmount: String(defaultRent),
        addMonth: this.nowMonth(),
        addTenant: prop.tenantName || ''
      });
    }
  },

  onAddAmount(e) { this.setData({ addAmount: e.detail.value }); },
  onAddMonth(e) { this.setData({ addMonth: e.detail.value }); },
  onAddTenant(e) { this.setData({ addTenant: e.detail.value }); },

  async doAddBill() {
    if (!this.data.addPropId || !this.data.addAmount) {
      wx.showToast({ title: '请选择房源并填写金额', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    try {
      const res = await api.post('/bills/manual', {
        property_id: parseInt(this.data.addPropId),
        amount: parseFloat(this.data.addAmount),
        bill_date: this.data.addMonth || undefined,
        remark: this.data.addTenant || ''
      });
      if (res.code === 0 || res.success) {
        wx.hideLoading();
        wx.showToast({ title: '添加成功', icon: 'success' });
        this.setData({ showAdd: false });
        this.loadData();
      } else {
        wx.hideLoading();
        wx.showToast({ title: res.msg || '添加失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  // ======== 编辑账单 ========
  editBill(e) {
    const idx = e.currentTarget.dataset.idx;
    const item = this.data.list[idx];
    if (!item) return;
    this.setData({
      showEdit: true,
      editItem: item,
      editAmount: String(item.amountNum),
      editMonth: (item.bill_date || '').substring(0, 7) || '',
      editStatus: item.status
    });
  },

  onEditAmount(e) { this.setData({ editAmount: e.detail.value }); },
  onEditMonth(e) { this.setData({ editMonth: e.detail.value }); },
  onEditStatusChange(e) {
    const vals = ['paid', 'pending'];
    this.setData({ editStatus: vals[e.detail.value] });
  },

  async doEditBill() {
    const item = this.data.editItem;
    if (!item || !this.data.editAmount) {
      wx.showToast({ title: '请填写金额', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    try {
      const data = { amount: parseFloat(this.data.editAmount) };
      if (this.data.editMonth) data.bill_period = this.data.editMonth;
      if (this.data.editStatus && this.data.editStatus !== item.status) {
        data.status = this.data.editStatus;
      }
      const res = await api.put('/bills/' + item.id + '/edit', data);
      if (res.code === 0) {
        wx.hideLoading();
        wx.showToast({ title: '编辑成功', icon: 'success' });
        this.setData({ showEdit: false });
        this.loadData();
      } else {
        wx.hideLoading();
        wx.showToast({ title: res.msg || '编辑失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '编辑失败', icon: 'none' });
    }
  },

  async markPaid(e) {
    try {
      const res = await api.put('/bills/' + e.currentTarget.dataset.id, { status: 'paid' });
      if (res.code === 0) { wx.showToast({ title: '已标记收款', icon: 'success' }); this.loadData(); }
    } catch (e) { wx.showToast({ title: '操作失败', icon: 'none' }); }
  },

  async delBill(e) {
    const idx = e.currentTarget.dataset.idx;
    const item = this.data.list[idx];
    if (!item) return;
    wx.showModal({
      title: '确认删除',
      content: '删除 ' + (item.property_name || '') + ' ' + (item.monthDisplay || '') + ' 的账单？',
      success: async (r) => {
        if (r.confirm) {
          try {
            const res = await api.del('/bills/' + item.id);
            if (res.code === 0) { wx.showToast({ title: '已删除', icon: 'success' }); this.loadData(); }
            else { wx.showToast({ title: res.msg || '删除失败', icon: 'none' }); }
          } catch (e) { wx.showToast({ title: '删除失败', icon: 'none' }); }
        }
      }
    });
  }
});
