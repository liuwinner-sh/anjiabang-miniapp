const api = require('../../utils/api');
const app = getApp();

Page({
  data: { refreshing: false, year: new Date().getFullYear(), yearStats: {}, monthData: [] },

  onShow() { this.loadYearData(); },
  onRefresh() { this.setData({ refreshing: true }); this.loadYearData().then(() => this.setData({ refreshing: false })); },

  async loadYearData() {
    try {
      const res = await api.get('/bills?page=1&pageSize=2000');
      const allBills = res.data?.list || [];
      const year = this.data.year;
      
      const monthData = [];
      let yearTotal = 0, yearCollected = 0, yearPending = 0;
      // API返回bill_date="2026-06-01"，取前7位得"2026-06"
      const yearBills = allBills.filter(b => (b.bill_date || '').startsWith(year));
      const maxVal = yearBills.length > 0 ? Math.max(...Object.values(yearBills.reduce((acc, b) => {
        const m = (b.bill_date || '').substring(0, 7);
        if (!acc[m]) acc[m] = 0;
        acc[m] += Number(b.amount) || 0;
        return acc;
      }, {})), 1) : 1;

      const now = new Date();
      const maxMonth = year < now.getFullYear() ? 12 : now.getMonth() + 1;

      for (let m = 1; m <= maxMonth; m++) {
        const ms = String(m).padStart(2, '0');
        const monthKey = `${year}-${ms}`;
        const bills = allBills.filter(b => (b.bill_date || '').startsWith(monthKey));
        const collected = bills.filter(b => b.status === 'paid').reduce((s, b) => s + (Number(b.amount) || 0), 0);
        const pending = bills.filter(b => b.status === 'pending').reduce((s, b) => s + (Number(b.amount) || 0), 0);
        const total = collected + pending;
        yearTotal += total;
        yearCollected += collected;
        yearPending += pending;
        
        if (total > 0 || collected > 0 || pending > 0) {
          monthData.push({
            month: monthKey,
            monthLabel: parseInt(monthKey.slice(5)) + '月',
            total: total.toLocaleString(),
            collected, collectedStr: collected.toLocaleString(),
            pending, pendingStr: pending.toLocaleString(),
            collectedPct: Math.max(collected / maxVal * 100, 3),
            pendingPct: Math.max(pending / maxVal * 100, 3),
            rate: total > 0 ? Math.round(collected / total * 100) : 0
          });
        }
      }

      this.setData({
        yearStats: { totalIncome: yearTotal.toLocaleString(), collected: yearCollected.toLocaleString(), pending: yearPending.toLocaleString() },
        monthData
      });
    } catch(e) { console.error(e); }
  },

  prevYear() { this.setData({ year: this.data.year - 1 }); this.loadYearData(); },
  nextYear() { this.setData({ year: this.data.year + 1 }); this.loadYearData(); },

  // 点击月份柱子→跳转到账单页并筛选该月
  viewMonth(e) {
    const month = e.currentTarget.dataset.month; // "2026-06"
    if (!month) return;
    const app = getApp();
    app.globalData.billMonthFilter = month;
    wx.navigateTo({ url: '/pages/bills/bills' });
  },

  goDashboard() { wx.redirectTo({ url: '/pages/dashboard/dashboard' }); },
  goProperties() { wx.navigateTo({ url: '/pages/properties/properties' }); },
  goBills() { wx.navigateTo({ url: '/pages/bills/bills' }); },
  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); }
});
