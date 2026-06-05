const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    loading: true,
    refreshing: false,
    userName: '房东', userInitial: '房', dateStr: '',
    stats: { propertyCount: 0, rentedCount: 0, vacantCount: 0, monthlyIncome: '0', collectionRate: 0, paidCount: 0, totalBills: 0 },
    monthlyIncome: [],
    alerts: [], recentProps: [],
    smartMatch: [], // 智能配盘
    promoTip: ''
  },

  onShow() {
    if (!app.globalData.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    const user = app.globalData.userInfo;
    const name = (user && (user.nickname || user.phone)) || '房东';
    const now = new Date();
    const weekDays = ['日','一','二','三','四','五','六'];
    this.setData({
      userName: name,
      userInitial: name.charAt(0),
      dateStr: `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 星期${weekDays[now.getDay()]}`
    });
    this.loadData();
  },

  onRefresh() { this.setData({ refreshing: true }); this.loadData().then(() => this.setData({ refreshing: false })); },

  async loadData() {
    try {
      this.setData({ loading: true });
      const [propsRes, tenantsRes, billsRes] = await Promise.all([
        api.get('/properties/my?page=1&pageSize=100'),
        api.get('/tenants?page=1&pageSize=100'),
        api.get('/bills?page=1&pageSize=2000')
      ]);

      // 智能配盘（有真实客户才显示）
      api.get('/smart/match').then(sr => {
        if (sr.success && sr.data && sr.data.length > 0) {
          this.setData({ smartMatch: sr.data.slice(0, 3) });
        } else {
          this.setData({ smartMatch: [] });
        }
      }).catch(() => {
        this.setData({ smartMatch: [] });
      });

      const props = propsRes.data?.list || propsRes.data || [];
      const tenants = tenantsRes.data?.list || [];
      const allBills = billsRes.data?.list || [];

      // 统计
      const rentedCount = props.filter(p => p.status === 'rented').length;
      const vacantCount = props.filter(p => p.status === 'active').length;
      const monthlyRent = props.reduce((s, p) => s + (parseFloat(p.rent) || 0), 0);

      // 本月账单
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const monthBills = allBills.filter(b => (b.bill_date || '').startsWith(thisMonth));
      const totalBills = monthBills.length;
      const paidCount = monthBills.filter(b => b.status === 'paid').length;
      const collectionRate = totalBills > 0 ? Math.round(paidCount / totalBills * 100) : 100;

      // 近6个月收入
      const monthlyMap = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        monthlyMap[key] = 0;
      }
      allBills.filter(b => b.status === 'paid').forEach(b => {
        const m = (b.bill_date || '').substring(0, 7);
        if (monthlyMap[m] !== undefined) monthlyMap[m] += Number(b.amount) || 0;
      });
      const vals = Object.values(monthlyMap);
      const maxVal = Math.max(...vals, 1);
      const minVal = Math.min(...vals);
      const range = maxVal - minVal;
      const monthlyIncome = Object.entries(monthlyMap).map(([month, val]) => ({
        month,
        monthLabel: parseInt(month.slice(5)) + '月',
        val: val.toLocaleString(),
        // 自适应缩放：差异小时放大差距，差异大时正常显示
        pct: range > 0 ? Math.max(25 + 75 * (val - minVal) / range, 8) : 50
      }));

      // 提醒 - 合同到期 & 租金逾期
      const alerts = [];
      // 合同到期提醒（仅对有效租客）
      tenants.forEach(t => {
        if (!t.contract_end || !t.name) return;
        const end = new Date(t.contract_end);
        const days = Math.ceil((end - now) / 86400000);
        if (days > 0 && days <= 30) {
          alerts.push({ icon: '⏰', text: `${t.name} 合同${days}天后到期`, detail: t.contract_end, action: 'renew', tenantName: t.name, tenantId: t.id, propertyId: t.property_id, sortKey: 1 });
        } else if (days <= 0 && days > -90) {
          alerts.push({ icon: '⚠️', text: `${t.name} 合同已到期${Math.abs(days)}天`, detail: t.contract_end, action: 'renew', tenantName: t.name, tenantId: t.id, propertyId: t.property_id, sortKey: 0 });
        }
      });
      // 租金逾期提醒（API返回字段：bill_date = "2026-06-01"）
      const nowMonth = now.getMonth() + 1; // 当前月份（1-12）
      const nowYear = now.getFullYear();
      allBills.filter(b => b.status === 'pending').forEach(b => {
        if (!b.bill_date) return;
        const parts = b.bill_date.split('-');
        if (parts.length < 2) return;
        const [by, bm] = parts.map(Number);
        if (!by || !bm) return;
        // 简单规则：账单月 < 当前月 且 非同年同月 → 视为逾期
        // 例如6月的账单，7月才标记逾期
        const isOverdue = (by < nowYear) || (by === nowYear && bm < nowMonth);
        if (isOverdue) {
          // 从次月1号起算逾期天数
          const overdueStart = new Date(by, bm - 1 + 1, 1); // 下月1号
          const days = Math.ceil((now - overdueStart) / 86400000);
          alerts.push({ icon: '💰', text: `${b.property_name || '房源'} 租金逾期${days}天`, detail: `¥${Number(b.amount||0).toLocaleString()}`, action: 'overdue', billId: b.id, propertyName: b.property_name, sortKey: 1 });
        }
      });
      // 排序：最紧急的排前面（到期合同 > 将到期合同 = 租金逾期）
      alerts.sort((a, b) => a.sortKey - b.sortKey || (a.action === 'overdue' ? -1 : 1));

      // AI推广提示 - 根据空置房源生成
      let promoTip = '';
      const vacantProps = props.filter(p => p.status === 'active' && !p.is_listed);
      if (vacantProps.length > 0) {
        promoTip = '你有 ' + vacantProps.length + ' 套空置房源，建议使用AI工具推广招租';
      } else if (props.some(p => p.status === 'active')) {
        promoTip = '已有房源在出租中，点击AI工具加速成交';
      }
      
      this.setData({
        stats: { propertyCount: props.length, rentedCount, vacantCount, monthlyIncome: monthlyRent.toLocaleString(), collectionRate, paidCount, totalBills },
        monthlyIncome,
        recentProps: props.slice(0, 5),
        alerts,
        promoTip,
        loading: false
      });
    } catch(e) { console.error(e); }
  },

  onAlert(e) {
    const a = this.data.alerts[e.currentTarget.dataset.idx];
    if (!a) return;
    if (a.action === 'renew') {
      // 跳转房源详情 → 查看合同信息、续签操作
      if (a.propertyId) {
        wx.navigateTo({ url: '/pages/property-detail/property-detail?id=' + a.propertyId });
      } else {
        wx.navigateTo({ url: '/pages/tenants/tenants' });
      }
    } else if (a.action === 'overdue') {
      // 跳转账单页并定位该房源
      const app = getApp();
      app.globalData.billSearch = a.propertyName;
      wx.navigateTo({ url: '/pages/bills/bills' });
    }
  },
  onAlertBtn(e) { this.onAlert(e); },

  goProperties() { wx.navigateTo({ url: '/pages/properties/properties' }); },
  goTenants() { wx.navigateTo({ url: '/pages/tenants/tenants' }); },
  goBills() { wx.navigateTo({ url: '/pages/bills/bills' }); },
  goRepairs() { wx.navigateTo({ url: '/pages/repairs/repairs' }); },
  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); },
  goAddProp() { wx.navigateTo({ url: '/pages/property-detail/property-detail?id=0' }); },
  goAddTenant() { wx.navigateTo({ url: '/pages/tenants/tenants' }); },
  goAddBill() { wx.navigateTo({ url: '/pages/bills/bills' }); },
  goReport() { wx.navigateTo({ url: '/pages/report/report' }); },
  goContract() { wx.navigateTo({ url: '/pages/filing/filing' }); },
  goCustomers() { wx.navigateTo({ url: '/pages/customers/customers' }); },
  viewProperty(e) { wx.navigateTo({ url: '/pages/property-detail/property-detail?id=' + e.currentTarget.dataset.id }); },

  // 🚀 推广中心
  goPromote() { wx.navigateTo({ url: '/pages/properties/properties' }); },
  goSmartPricing() {
    const props = this.data.recentProps;
    if (props.length > 0) {
      wx.navigateTo({ url: '/pages/property-detail/property-detail?id=' + props[0].id });
      wx.showToast({ title: '进入房源详情→点AI定价', icon: 'none', duration: 2000 });
    } else { wx.navigateTo({ url: '/pages/properties/properties' }); }
  },
  goSmartPoster() {
    const props = this.data.recentProps;
    if (props.length > 0) {
      wx.navigateTo({ url: '/pages/property-detail/property-detail?id=' + props[0].id });
      wx.showToast({ title: '进入房源详情→点AI海报', icon: 'none', duration: 2000 });
    } else { wx.navigateTo({ url: '/pages/properties/properties' }); }
  },
  goSmartDistribute() {
    const props = this.data.recentProps;
    if (props.length > 0) {
      wx.navigateTo({ url: '/pages/property-detail/property-detail?id=' + props[0].id });
      wx.showToast({ title: '进入房源详情→点分发', icon: 'none', duration: 2000 });
    } else { wx.navigateTo({ url: '/pages/properties/properties' }); }
  },
  goSmartDesc() {
    const props = this.data.recentProps;
    if (props.length > 0) {
      wx.navigateTo({ url: '/pages/property-detail/property-detail?id=' + props[0].id });
      wx.showToast({ title: '进入房源详情→点AI描述', icon: 'none', duration: 2000 });
    } else { wx.navigateTo({ url: '/pages/properties/properties' }); }
  }
});
