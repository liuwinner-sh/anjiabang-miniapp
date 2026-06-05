const app = getApp();

function request(path, method = 'GET', data = {}) {
  const token = app.globalData.token;
  const url = app.globalData.apiBase + path;
  
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      timeout: 15000, // 15秒超时
      header: {
        'content-type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      },
      success(res) {
        if (res.data.code === 0 || res.data.success) {
          resolve(res.data);
        } else if (res.data.code === 401) {
          wx.showToast({ title: '登录已过期', icon: 'none' });
          app.logout();
          reject(res.data);
        } else {
          resolve(res.data);
        }
      },
      fail(err) {
        wx.showToast({ title: '网络错误', icon: 'none' });
        reject(err);
      }
    });
  });
}

function get(path, data) { return request(path, 'GET', data); }
function post(path, data) { return request(path, 'POST', data); }
function put(path, data) { return request(path, 'PUT', data); }
function del(path) { return request(path, 'DELETE'); }

module.exports = { request, get, post, put, del };
