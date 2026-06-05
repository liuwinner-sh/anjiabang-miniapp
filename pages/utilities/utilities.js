const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    properties: [],
    curPropIdx: 0,
    curProperty: null,
    accounts: [],
    latestReadings: [],
    readingHistory: [],
    // 绑定弹窗
    showBind: false,
    bindType: 'electricity',
    bindAccount: '',
    bindReading: '',
    // 抄表弹窗
    showMeter: false,
    meterAccountId: '',
    meterReading: '',
    submittingMeter: false
  },

  onShow() { this.loadData(); },

  async loadData() {
    try {
      const pRes = await api.get('/properties/my?page=1&pageSize=100');
      const props = pRes.data?.list || [];
      this.setData({ properties: props });
      if (props.length > 0) {
        await this.selectProperty(props[0]);
      }
    } catch(e) { console.error(e); }
  },

  async selectProperty(prop) {
    this.setData({ curProperty: prop, accounts: [], latestReadings: [], readingHistory: [] });
    if (!prop) return;
    try {
      const [aRes, mRes] = await Promise.all([
        api.get('/utility_account/property/' + prop.id),
        api.get('/meter/property/' + prop.id + '/latest')
      ]);
      const accounts = aRes.data || [];
      const readings = mRes.data || [];
      // 标记哪些账户有读数
      const readingAccountIds = readings.map(r => r.utility_account_id);
      accounts.forEach(ac => {
        ac._hasReading = readingAccountIds.includes(ac.id);
      });
      this.setData({
        accounts,
        latestReadings: readings
      });
    } catch(e) { console.error(e); }
  },

  onPropChange(e) {
    const idx = e.detail.value;
    const prop = this.data.properties[idx];
    this.setData({ curPropIdx: idx });
    this.selectProperty(prop);
  },

  // ---- 绑定水电煤账户 ----
  openBind() {
    this.setData({
      showBind: true,
      bindType: 'electricity',
      bindAccount: '',
      bindReading: ''
    });
  },
  closeBind() { this.setData({ showBind: false }); },
  onBindType(e) { this.setData({ bindType: e.detail.value }); },
  onBindAccount(e) { this.setData({ bindAccount: e.detail.value }); },
  onBindReading(e) { this.setData({ bindReading: e.detail.value }); },

  async doBind() {
    const prop = this.data.curProperty;
    if (!prop || !this.data.bindAccount) {
      wx.showToast({ title: '请填写户号', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '绑定中...' });
    try {
      const res = await api.post('/utility_account/bind', {
        property_id: prop.id,
        user_id: app.globalData.userInfo?.id || 1,
        utility_type: this.data.bindType,
        account_number: this.data.bindAccount,
        billing_cycle: 'monthly',
        billing_day: 5
      });
      wx.hideLoading();
      if (res.success) {
        wx.showToast({ title: '绑定成功', icon: 'success' });
        this.setData({ showBind: false });
        this.selectProperty(prop);
      } else {
        wx.showToast({ title: res.error || '绑定失败', icon: 'none' });
      }
    } catch(e) {
      wx.hideLoading();
      wx.showToast({ title: '绑定失败', icon: 'none' });
    }
  },

  // ---- 抄表 ----
  openMeter(e) {
    const acid = e.currentTarget.dataset.acid;
    this.setData({
      showMeter: true,
      meterAccountId: acid,
      meterReading: ''
    });
  },
  closeMeter() { this.setData({ showMeter: false }); },
  onMeterInput(e) { this.setData({ meterReading: e.detail.value }); },

  async submitMeter() {
    const prop = this.data.curProperty;
    if (!this.data.meterReading) {
      wx.showToast({ title: '请输入表读数', icon: 'none' });
      return;
    }
    this.setData({ submittingMeter: true });
    try {
      const now = new Date();
      const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
      const res = await api.post('/meter/submit', {
        utility_account_id: parseInt(this.data.meterAccountId),
        property_id: prop.id,
        reading_value: parseFloat(this.data.meterReading),
        reading_date: dateStr,
        submitted_by: app.globalData.userInfo?.id || 1
      });
      if (res.success) {
        wx.showToast({
          title: res.data.consumption !== null ? '录入成功！用量：' + res.data.consumption + (res.data.consumption ? '' : '（首次录入无法计算用量）') : '录入成功',
          icon: 'none',
          duration: 2500
        });
        this.setData({ showMeter: false, submittingMeter: false });
        this.selectProperty(prop);
      } else {
        wx.showToast({ title: res.error || '录入失败', icon: 'none' });
        this.setData({ submittingMeter: false });
      }
    } catch(e) {
      wx.showToast({ title: '录入失败', icon: 'none' });
      this.setData({ submittingMeter: false });
    }
  },

  // ---- 查看历史 ----
  async viewHistory(e) {
    const acid = e.currentTarget.dataset.acid;
    try {
      const res = await api.get('/meter/account/' + acid + '?limit=12');
      const data = res.data || [];
      this.setData({ readingHistory: data });
      if (data.length === 0) {
        wx.showToast({ title: '暂无历史记录', icon: 'none' });
      }
    } catch(e) { wx.showToast({ title: '加载失败', icon: 'none' }); }
  },

  hideHistory() { this.setData({ readingHistory: [] }); },

  getTypeName(t) {
    const m = { electricity: '⚡ 电表', water: '💧 水表', gas: '🔥 燃气' };
    return m[t] || t;
  },

  goBack() { wx.navigateBack(); }
});
