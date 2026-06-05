const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    userName: '', userPhone: '', userInitial: '房',
    // 修改密码
    showPwd: false,
    oldPwd: '', newPwd: '', confirmPwd: '',
    // 套餐订阅
    showSub: false,
    plans: [],
    currentPlan: null,
    planDesc: {
      free: '免费版 · 每月3次AI调用',
      basic: '基础版 · ¥29/月 · 999次AI',
      pro: '专业版 · ¥129/月 · 9999次AI',
      enterprise: '企业版 · ¥199/月 · 不限次',
      landlord_basic: '房东基础版 · ¥19/月 · 999次',
      landlord_pro: '房东管家版 · ¥49/月 · 9999次'
    }
  },

  onShow() {
    const user = app.globalData.userInfo;
    if (user) {
      this.setData({
        userName: user.nickname || user.phone || '房东',
        userPhone: user.phone || '',
        userInitial: (user.nickname || user.phone || '房').charAt(0)
      });
    }
  },

  // ---- 修改密码 ----
  changePwd() {
    this.setData({ showPwd: true, oldPwd: '', newPwd: '', confirmPwd: '' });
  },
  closePwd() { this.setData({ showPwd: false }); },
  onPwdField(e) {
    const f = e.currentTarget.dataset.f;
    this.setData({ [f]: e.detail.value });
  },
  async doChangePwd() {
    const { oldPwd, newPwd, confirmPwd } = this.data;
    if (!oldPwd || !newPwd) { wx.showToast({ title: '请填写旧密码和新密码', icon: 'none' }); return; }
    if (newPwd.length < 6) { wx.showToast({ title: '新密码至少6位', icon: 'none' }); return; }
    if (newPwd !== confirmPwd) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }
    wx.showLoading({ title: '修改中...' });
    try {
      const res = await api.post('/auth/change-password', { oldPassword: oldPwd, newPassword: newPwd });
      if (res.code === 0) {
        wx.hideLoading();
        wx.showToast({ title: '密码修改成功', icon: 'success' });
        this.setData({ showPwd: false });
      } else {
        wx.hideLoading();
        wx.showToast({ title: res.msg || '修改失败', icon: 'none' });
      }
    } catch(e) {
      wx.hideLoading();
      wx.showToast({ title: '修改失败', icon: 'none' });
    }
  },

  // ---- 套餐订阅 ----
  async goSubscription() {
    wx.showLoading({ title: '加载中...' });
    try {
      const [planRes, statusRes] = await Promise.all([
        api.get('/subscription/plans'),
        api.get('/subscription/status')
      ]);
      this.setData({
        showSub: true,
        plans: planRes.data || [],
        currentPlan: statusRes.data || { plan: 'free' }
      });
      wx.hideLoading();
    } catch(e) {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
  closeSub() { this.setData({ showSub: false }); },

  async doUpgrade(e) {
    const plan = e.currentTarget.dataset.plan;
    wx.showModal({
      title: '确认升级',
      content: `升级到${this.data.planDesc[plan] || plan}？`,
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '升级中...' });
        try {
          const r = await api.post('/subscription/upgrade', { plan });
          if (r.success) {
            wx.hideLoading();
            wx.showToast({ title: r.message || '升级成功', icon: 'success' });
            this.setData({ showSub: false });
          } else {
            wx.hideLoading();
            wx.showToast({ title: r.error || '升级失败', icon: 'none' });
          }
        } catch(e) {
          wx.hideLoading();
          wx.showToast({ title: '升级失败', icon: 'none' });
        }
      }
    });
  },

  showReport() { wx.navigateTo({ url: '/pages/report/report' }); },
  goUtilities() { wx.navigateTo({ url: '/pages/utilities/utilities' }); },
  goRepairs() { wx.navigateTo({ url: '/pages/repairs/repairs' }); },
  goFiling() { wx.navigateTo({ url: '/pages/filing/filing' }); },
  goCustomers() { wx.navigateTo({ url: '/pages/customers/customers' }); },

  doLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出吗？',
      success: (res) => {
        if (res.confirm) app.logout();
      }
    });
  }
});
