const app = getApp();
const api = require('../../utils/api');

Page({
  data: {
    tab: 'login',
    phone: '', pwd: '',
    regPhone: '', regPwd: '', regPwd2: '', regName: '',
    msg: '', msgType: '',
    regMsg: '', regMsgType: '',
    loading: false, regLoading: false,
    // 重置密码
    resetPhone: '', resetPwd: '', resetPwd2: '',
    resetMsg: '', resetMsgType: '', resetLoading: false
  },

  onShow() {
    if (app.globalData.token) {
      wx.redirectTo({ url: '/pages/dashboard/dashboard' });
    }
  },
  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab, msg: '', regMsg: '' });
  },
  onPhone(e) { this.setData({ phone: e.detail.value }); },
  onPwd(e) { this.setData({ pwd: e.detail.value }); },
  onRegPhone(e) { this.setData({ regPhone: e.detail.value }); },
  onRegPwd(e) { this.setData({ regPwd: e.detail.value }); },
  onRegPwd2(e) { this.setData({ regPwd2: e.detail.value }); },
  onRegName(e) { this.setData({ regName: e.detail.value }); },

  // ---- 忘记密码 ----
  forgotPwd() { this.setData({ tab: 'reset', resetMsg: '', resetPhone: '', resetPwd: '', resetPwd2: '' }); },
  onResetPhone(e) { this.setData({ resetPhone: e.detail.value }); },
  onResetPwd(e) { this.setData({ resetPwd: e.detail.value }); },
  onResetPwd2(e) { this.setData({ resetPwd2: e.detail.value }); },

  doReset() {
    const { resetPhone: phone, resetPwd: pwd, resetPwd2: pwd2 } = this.data;
    if (!phone) { this.setData({ resetMsg: '请输入手机号', resetMsgType: 'err' }); return; }
    if (!pwd || pwd.length < 6) { this.setData({ resetMsg: '密码至少6位', resetMsgType: 'err' }); return; }
    if (pwd !== pwd2) { this.setData({ resetMsg: '两次密码不一致', resetMsgType: 'err' }); return; }
    this.setData({ resetLoading: true, resetMsg: '', resetMsgType: '' });

    wx.request({
      url: app.globalData.apiBase + '/auth/reset-password',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: JSON.stringify({ phone, newPassword: pwd }),
      success: (res) => {
        const d = res.data;
        if (d.code === 0) {
          this.setData({ resetMsg: d.msg || '重置成功', resetMsgType: 'ok' });
          setTimeout(() => { this.setData({ tab: 'login', phone, resetMsg: '' }); }, 1500);
        } else {
          this.setData({ resetMsg: d.msg || '重置失败', resetMsgType: 'err' });
        }
      },
      fail: () => { this.setData({ resetMsg: '网络错误', resetMsgType: 'err' }); },
      complete: () => { this.setData({ resetLoading: false }); }
    });
  },

  doLogin() {
    const { phone, pwd } = this.data;
    if (!phone) { this.setData({ msg: '请输入手机号', msgType: 'err' }); return; }
    if (!pwd) { this.setData({ msg: '请输入密码', msgType: 'err' }); return; }
    this.setData({ loading: true, msg: '', msgType: '' });

    wx.request({
      url: app.globalData.apiBase + '/auth/login',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: JSON.stringify({ phone, password: pwd }),
      success: (res) => {
        const d = res.data;
        if (d.code === 0 && d.data && d.data.token) {
          app.setToken(d.data.token);
          app.globalData.userInfo = d.data.user;
          wx.showToast({ title: '登录成功', icon: 'success' });
          wx.redirectTo({ url: '/pages/dashboard/dashboard' });
        } else {
          const hint = d.msg === '密码错误' ? '（点击"忘记密码？"可重置）' : '';
          this.setData({ msg: d.msg + hint || '登录失败', msgType: 'err' });
        }
      },
      fail: () => { this.setData({ msg: '网络错误', msgType: 'err' }); },
      complete: () => { this.setData({ loading: false }); }
    });
  },

  doReg() {
    const { regPhone: phone, regPwd: pwd, regPwd2: pwd2, regName } = this.data;
    if (!phone) { this.setData({ regMsg: '请输入手机号', regMsgType: 'err' }); return; }
    if (!pwd || pwd.length < 6) { this.setData({ regMsg: '密码至少6位', regMsgType: 'err' }); return; }
    if (pwd2 && pwd !== pwd2) { this.setData({ regMsg: '密码不一致', regMsgType: 'err' }); return; }
    this.setData({ regLoading: true, regMsg: '', regMsgType: '' });

    wx.request({
      url: app.globalData.apiBase + '/auth/register',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: JSON.stringify({ phone, password: pwd, nickname: regName || phone }),
      success: (res) => {
        const d = res.data;
        if (d.code === 0) {
          this.setData({ regMsg: '注册成功！请登录', regMsgType: 'ok' });
          setTimeout(() => { this.setData({ tab: 'login', phone, regMsg: '' }); }, 1000);
        } else {
          this.setData({ regMsg: d.msg || '注册失败', regMsgType: 'err' });
        }
      },
      fail: () => { this.setData({ regMsg: '网络错误', regMsgType: 'err' }); },
      complete: () => { this.setData({ regLoading: false }); }
    });
  }
});
