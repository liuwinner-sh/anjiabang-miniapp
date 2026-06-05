App({
  globalData: {
    token: '',
    userInfo: null,
    apiBase: 'https://adequate-drums-wright-effective.trycloudflare.com/api/fang'
  },
  onLaunch() {
    const token = wx.getStorageSync('token');
    if (token) {
      this.globalData.token = token;
    }
  },
  setToken(token) {
    this.globalData.token = token;
    wx.setStorageSync('token', token);
  },
  logout() {
    this.globalData.token = '';
    this.globalData.userInfo = null;
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
    wx.reLaunch({ url: '/pages/login/login' });
  }
});
