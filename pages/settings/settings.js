const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    userName: '', userPhone: '', userInitial: '房',
    userAvatar: '', userRole: '',
    // 编辑昵称
    showNameEditor: false,
    editNameVal: '',
    // 修改密码
    showPwd: false,
    oldPwd: '', newPwd: '', confirmPwd: '',
  },

  onShow() {
    this.loadUser();
  },

  loadUser() {
    const user = app.globalData.userInfo;
    if (user) {
      this.setData({
        userName: user.nickname || user.phone || '房东',
        userPhone: user.phone || '',
        userAvatar: user.avatar || '',
        userRole: user.role || '',
        userInitial: (user.nickname || user.phone || '房').charAt(0).toUpperCase()
      });
    }
  },

  // ---- 修改头像 ----
  changeAvatar() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      success: (res) => {
        const tempFile = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...' });
        const uploadUrl = app.globalData.apiBase.replace('/api/fang', '') + '/api/fang/upload/avatar';
        wx.uploadFile({
          url: uploadUrl,
          filePath: tempFile,
          name: 'avatar',
          header: { 'Authorization': 'Bearer ' + app.globalData.token },
          success: (r) => {
            try {
              const d = JSON.parse(r.data);
              if (d.code === 0 && d.data && d.data.url) {
                const avatarUrl = d.data.url.startsWith('http') ? d.data.url : 'https://adequate-drums-wright-effective.trycloudflare.com' + d.data.url;
                app.globalData.userInfo.avatar = avatarUrl;
                this.setData({ userAvatar: avatarUrl });
                wx.hideLoading();
                wx.showToast({ title: '头像已更新', icon: 'success' });
              } else {
                wx.hideLoading();
                wx.showToast({ title: '上传失败', icon: 'none' });
              }
            } catch(e) {
              wx.hideLoading();
              wx.showToast({ title: '上传失败', icon: 'none' });
            }
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
        });
      }
    });
  },

  // ---- 编辑昵称 ----
  editName() {
    this.setData({ showNameEditor: true, editNameVal: this.data.userName });
  },
  closeNameEditor() { this.setData({ showNameEditor: false }); },
  onNameInput(e) { this.setData({ editNameVal: e.detail.value }); },
  async saveName() {
    const name = this.data.editNameVal;
    if (!name || !name.trim()) { wx.showToast({ title: '昵称不能为空', icon: 'none' }); return; }
    wx.showLoading({ title: '保存中...' });
    try {
      const res = await api.put('/user/profile', { nickname: name.trim() });
      wx.hideLoading();
      if (res.code === 0) {
        app.globalData.userInfo.nickname = name.trim();
        this.setData({
          userName: name.trim(),
          userInitial: name.trim().charAt(0).toUpperCase(),
          showNameEditor: false
        });
        wx.showToast({ title: '昵称已更新', icon: 'success' });
      } else {
        wx.showToast({ title: res.msg || '保存失败', icon: 'none' });
      }
    } catch(e) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
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
  goSubscription() { wx.navigateTo({ url: '/pages/subscription/subscription' }); },

  showReport() { wx.navigateTo({ url: '/pages/report/report' }); },
  goTenants() { wx.navigateTo({ url: '/pages/tenants/tenants' }); },
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
