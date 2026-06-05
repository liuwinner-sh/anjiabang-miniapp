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
    showHistory: false,
    // 解绑确认
    showUnbind: false,
    unbindAccountId: null,
    unbindAccountInfo: null,
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
        user_id: app.globalData.userId || 1,
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
        submitted_by: app.globalData.userId || 1
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
      // 计算用量趋势：相邻两次读数差值
      const trends = [];
      for (let i = 1; i < data.length; i++) {
        const prev = Number(data[i-1].reading_value) || 0;
        const curr = Number(data[i].reading_value) || 0;
        if (prev > 0 && curr > prev) {
          trends.push({
            date: data[i].reading_date || data[i].created_at?.slice(0,10) || '',
            consumption: (curr - prev).toFixed(1),
            reading: curr
          });
        }
      }
      this.setData({ readingHistory: data, showHistory: true });
      // 显示用量趋势
      if (trends.length > 0) {
        const last3 = trends.slice(-3).reverse();
        let trendMsg = '📊 最近用量趋势：\n';
        last3.forEach(t => {
          trendMsg += t.date + ' → 用量 ' + t.consumption + '\n';
        });
        if (trends.length >= 3) {
          const avg = trends.slice(-3).reduce((s,t) => s + parseFloat(t.consumption), 0) / 3;
          trendMsg += '月均用量：' + avg.toFixed(1);
        }
        wx.showToast({ title: trendMsg, icon: 'none', duration: 3000 });
      } else if (data.length === 0) {
        wx.showToast({ title: '暂无历史记录', icon: 'none' });
      }
    } catch(e) { wx.showToast({ title: '加载失败', icon: 'none' }); }
  },

  hideHistory() { this.setData({ readingHistory: [], showHistory: false }); },

  // ---- 解绑账户 ----
  confirmUnbind(e) {
    const acid = e.currentTarget.dataset.acid;
    const account = this.data.accounts.find(a => a.id === acid);
    if (!account) return;
    this.setData({
      showUnbind: true,
      unbindAccountId: acid,
      unbindAccountInfo: account
    });
  },
  closeUnbind() { this.setData({ showUnbind: false }); },
  async doUnbind() {
    const acid = this.data.unbindAccountId;
    if (!acid) return;
    wx.showLoading({ title: '解绑中...' });
    try {
      const res = await api.del('/utility_account/' + acid);
      if (res.success) {
        wx.hideLoading();
        wx.showToast({ title: '已解绑', icon: 'success' });
        this.setData({ showUnbind: false });
        this.selectProperty(this.data.curProperty);
      } else {
        wx.hideLoading();
        wx.showToast({ title: res.error || '解绑失败', icon: 'none' });
      }
    } catch(e) {
      wx.hideLoading();
      wx.showToast({ title: '解绑失败', icon: 'none' });
    }
  },

  getTypeName(t) {
    const m = { electricity: '⚡ 电表', water: '💧 水表', gas: '🔥 燃气' };
    return m[t] || t;
  },

  goBack() { wx.navigateBack(); }
});
