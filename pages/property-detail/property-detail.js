const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    p: { name: '', address: '', city: '', rent: '', area: '', room: 1, hall: 1, roomDisplay: '1室1厅', remark: '', id: 0 },
    photos: [],
    roomTypes: ['1室0厅','1室1厅','2室1厅','2室2厅','3室1厅','3室2厅','4室2厅','5室3厅'],
    tenant: {},
    aiLoading: false,
    distLoading: false,
    priceLoading: false,
    posterLoading: false,
    aiResult: '',
    aiResultTitle: '',
    priceSuggest: null,
    posterData: null,
    priceRangeLow: 0,
    priceRangeHigh: 0
  },

  onLoad(opts) {
    const id = parseInt(opts.id);
    if (id) this.loadProperty(id);
  },

  async loadProperty(id) {
    try {
      const [pRes, photoRes, tRes] = await Promise.all([
        api.get('/properties/' + id),
        api.get('/upload/properties/' + id),
        api.get('/tenants?page=1&pageSize=100')
      ]);
      const p = pRes.code === 0 ? (pRes.data || pRes) : {};
      // 照片列表：API返回 {code:0, data:[{id,url,...}]} 或直接数组
      const base = 'https://adequate-drums-wright-effective.trycloudflare.com';
      let photos = [];
      let rawPhotos = [];
      if (Array.isArray(photoRes.data)) {
        rawPhotos = photoRes.data;
      } else if (Array.isArray(photoRes)) {
        rawPhotos = photoRes;
      } else if (Array.isArray(photoRes.photos)) {
        rawPhotos = photoRes.photos;
      }
      photos = rawPhotos.map(ph => ({
        ...ph,
        url: ph.url && !ph.url.startsWith('http') ? base + ph.url : ph.url
      }));
      const rd = p.room && p.hall ? `${p.room}室${p.hall}厅` : '1室1厅';
      
      // 查找该房源的租客
      const tenants = tRes.data?.list || [];
      const tenant = tenants.find(t => t.property_id === id) || {};
      if (tenant.contract_end) {
        const now = new Date();
        const end = new Date(tenant.contract_end);
        tenant.daysLeft = Math.ceil((end - now) / 86400000);
        tenant.endDisplay = tenant.contract_end.slice(0, 10);
      }
      
      this.setData({ p: { ...p, roomDisplay: rd }, photos, tenant });
    } catch(e) { console.error(e); }
  },

  onField(e) {
    const f = e.currentTarget.dataset.f;
    this.setData({ ['p.' + f]: e.detail.value });
  },

  onRoomChange(e) {
    const val = this.data.roomTypes[e.detail.value];
    const parts = val.match(/(\d+)室(\d+)厅/);
    if (parts) {
      this.setData({
        'p.room': parseInt(parts[1]),
        'p.hall': parseInt(parts[2]),
        'p.roomDisplay': val
      });
    }
  },

  async save() {
    const p = this.data.p;
    if (!p.name) { wx.showToast({ title: '请输入房源名称', icon: 'none' }); return; }
    wx.showLoading({ title: '保存中...' });
    try {
      const data = { name: p.name, address: p.address, city: p.city, rent: parseFloat(p.rent) || 0, area: parseFloat(p.area) || 0, room: p.room || 1, hall: p.hall || 1, remark: p.remark || '' };
      let res;
      if (p.id) res = await api.put('/properties/' + p.id, data);
      else res = await api.post('/properties', data);
      if (res.code === 0) {
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
        // 如果是新增，跳到编辑页继续添加照片
        if (!p.id && res.data && res.data.id) {
          wx.redirectTo({ url: '/pages/property-detail/property-detail?id=' + res.data.id });
        } else {
          wx.navigateBack();
        }
      } else { wx.hideLoading(); wx.showToast({ title: res.msg || '保存失败', icon: 'none' }); }
    } catch(e) { wx.hideLoading(); wx.showToast({ title: '保存失败', icon: 'none' }); }
  },

  uploadPhoto() {
    const propId = this.data.p.id;
    if (!propId) { wx.showToast({ title: '请先保存房源', icon: 'none' }); return; }
    const apiBase = app.globalData.apiBase.replace('/api/fang', '');
    wx.chooseMedia({
      count: 9, mediaType: ['image'],
      success: (res) => {
        const files = res.tempFiles.map(f => f.tempFilePath);
        wx.showLoading({ title: '上传中...' });
        const uploadTasks = files.map(file => {
          return new Promise((resolve, reject) => {
            wx.uploadFile({
              url: apiBase + '/api/fang/upload/properties/' + propId,
              filePath: file,
              name: 'photos',
              header: { 'Authorization': 'Bearer ' + app.globalData.token },
              success: (r) => {
                try { resolve(JSON.parse(r.data)); } catch(e) { resolve(null); }
              },
              fail: reject
            });
          });
        });
        Promise.all(uploadTasks).then((results) => {
          wx.hideLoading();
          wx.showToast({ title: '上传完成', icon: 'success' });
          // 尝试刷新，如果失败则手动追加
          try {
            this.loadProperty(propId);
          } catch(e) {
            const newPhotos = results.filter(r => r && r.data).flatMap(r => {
              const urls = r.data.photos || [];
              return urls.map(url => ({ url: base + url }));
            });
            if (newPhotos.length) {
              this.setData({ photos: [...this.data.photos, ...newPhotos] });
            }
          }
        }).catch(() => { wx.hideLoading(); wx.showToast({ title: '上传失败', icon: 'none' }); });
      }
    });
  },

  async delPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photo = this.data.photos[idx];
    if (!photo) return;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这张照片吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          if (photo.id) {
            const r = await api.del('/upload/photos/' + photo.id);
            if (r.code !== 0) { wx.showToast({ title: r.msg || '删除失败', icon: 'none' }); return; }
          }
          const photos = [...this.data.photos];
          photos.splice(idx, 1);
          this.setData({ photos });
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch(e) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  // × 直接删除照片（无确认弹窗）
  async delPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photoid = e.currentTarget.dataset.photoid;
    const photo = this.data.photos[idx];
    if (!photo) return;
    wx.showLoading({ title: '删除中...' });
    try {
      if (photoid) {
        const r = await api.del('/upload/photos/' + photoid);
        if (r.code !== 0 && r.code !== 404) {
          wx.hideLoading();
          wx.showToast({ title: r.msg || '删除失败', icon: 'none' });
          return;
        }
      }
      const photos = [...this.data.photos];
      photos.splice(idx, 1);
      this.setData({ photos });
      wx.hideLoading();
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch(e) {
      wx.hideLoading();
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  // ↻ 替换照片
  async replacePhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photoid = e.currentTarget.dataset.photoid;
    const propId = this.data.p.id;
    if (!propId) return;
    const apiBase = app.globalData.apiBase.replace('/api/fang', '');
    
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      success: (res) => {
        wx.showLoading({ title: '上传中...' });
        // 先删旧图
        const deleteOld = photoid ? api.del('/upload/photos/' + photoid) : Promise.resolve();
        deleteOld.then(() => {
          wx.uploadFile({
            url: apiBase + '/api/fang/upload/properties/' + propId,
            filePath: res.tempFiles[0].tempFilePath,
            name: 'photos',
            header: { 'Authorization': 'Bearer ' + app.globalData.token },
            success: (r) => {
              wx.hideLoading();
              wx.showToast({ title: '替换成功', icon: 'success' });
              this.loadProperty(propId);
            },
            fail: () => { wx.hideLoading(); wx.showToast({ title: '上传失败', icon: 'none' }); }
          });
        }).catch(() => {
          // 删除旧图失败但继续上传
          wx.uploadFile({
            url: apiBase + '/api/fang/upload/properties/' + propId,
            filePath: res.tempFiles[0].tempFilePath,
            name: 'photos',
            header: { 'Authorization': 'Bearer ' + app.globalData.token },
            success: (r) => { wx.hideLoading(); wx.showToast({ title: '替换成功', icon: 'success' }); this.loadProperty(propId); },
            fail: () => { wx.hideLoading(); wx.showToast({ title: '上传失败', icon: 'none' }); }
          });
        });
      }
    });
  },

  // 👆 点击图片设为封面
  async setCover(e) {
    const idx = e.currentTarget.dataset.idx;
    const photo = this.data.photos[idx];
    if (!photo) return;
    // 如果没有id，说明是刚上传的本地照片
    const photoid = photo.id || e.currentTarget.dataset.photoid;
    if (!photoid) { wx.showToast({ title: '请等待照片上传完成', icon: 'none' }); return; }
    wx.showLoading({ title: '设为封面...' });
    try {
      const r = await api.put('/upload/photos/' + photoid, { is_primary: 1 });
      wx.hideLoading();
      if (r.code === 0) {
        wx.showToast({ title: '✅ 已设为封面', icon: 'success' });
        this.loadProperty(this.data.p.id);
      } else {
        wx.showToast({ title: r.msg || '设置失败', icon: 'none' });
      }
    } catch(e) {
      wx.hideLoading();
      wx.showToast({ title: '设置失败', icon: 'none' });
    }
  },

  async del() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除此房源吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const r = await api.del('/properties/' + this.data.p.id);
            if (r.code === 0) { wx.showToast({ title: '已删除', icon: 'success' }); wx.navigateBack(); }
          } catch(e) { wx.showToast({ title: '删除失败', icon: 'none' }); }
        }
      }
    });
  },

  // 续签合同（延长一年）
  async renewContract() {
    const t = this.data.tenant;
    if (!t || !t.id || !t.contract_end) {
      wx.showToast({ title: '没有可续签的合同', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '续签合同',
      content: `将 ${t.name} 的合同从 ${t.contract_end.slice(0,10)} 延长至 ${(parseInt(t.contract_end.slice(0,4))+1)}-${t.contract_end.slice(5,10)} ？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const oldEnd = new Date(t.contract_end);
          const newEnd = new Date(oldEnd.getFullYear() + 1, oldEnd.getMonth(), oldEnd.getDate());
          const r = await api.put('/tenants/' + t.id, { contract_end: newEnd.toISOString().slice(0, 10) });
          if (r.code === 0) {
            wx.showToast({ title: '续签成功', icon: 'success' });
            this.loadProperty(this.data.p.id);
          } else { wx.showToast({ title: r.msg || '续签失败', icon: 'none' }); }
        } catch(e) { wx.showToast({ title: '续签失败', icon: 'none' }); }
      }
    });
  },

  // 查看该房源账单
  goTenantBills() {
    const app = getApp();
    app.globalData.billSearch = this.data.p.name;
    wx.navigateTo({ url: '/pages/bills/bills' });
  },

  // 🤖 AI生成房源描述
  async generateAIDesc() {
    const id = this.data.p.id;
    if (!id) return;
    this.setData({ aiLoading: true, aiResult: '' });
    try {
      const r = await api.post('/properties/' + id + '/ai-desc');
      if (r.code === 0 && r.data) {
        this.setData({ aiResult: r.data.description || r.data || '生成成功' });
        wx.showToast({ title: 'AI描述已生成, 已自动保存', icon: 'success', duration: 2000 });
        // 重新加载房源数据，显示保存的描述
        this.loadProperty(id);
      } else {
        wx.showToast({ title: r.msg || '生成失败', icon: 'none' });
      }
    } catch(e) {
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
    this.setData({ aiLoading: false });
  },

  // 📤 多平台分发
  async distribute() {
    const id = this.data.p.id;
    if (!id) return;
    this.setData({ distLoading: true });
    try {
      const r = await api.post('/properties/' + id + '/distribute');
      if (r.code === 0 && r.data) {
        const channels = r.data.channels || r.data;
        const channelNames = Object.keys(channels).join('、');
        // 显示完整分发结果
        let resultText = r.data.summary ? '📢 ' + r.data.summary + '\n\n' : '';
        for (const [ch, text] of Object.entries(channels)) {
          resultText += '━━━ ' + ch + ' ━━━\n';
          resultText += text + '\n\n';
        }
        this.setData({ aiResult: resultText, aiResultTitle: '📤 多平台分发文案（可复制）' });
        wx.showModal({
          title: '分发完成',
          content: '已生成' + channelNames + '等' + Object.keys(channels).length + '个渠道的推广文案，可复制到对应平台发布',
          showCancel: false
        });
      } else {
        wx.showToast({ title: r.msg || '分发失败', icon: 'none' });
      }
    } catch(e) {
      wx.showToast({ title: '分发失败', icon: 'none' });
    }
    this.setData({ distLoading: false });
  },

  // 📋 复制结果
  copyResult() {
    const text = this.data.aiResult;
    if (!text) return;
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  },

  // 📋 复制房源描述
  copyDesc() {
    const p = this.data.p;
    let text = p.title + '\n';
    if (p.room && p.hall) text += p.room + '室' + p.hall + '厅 ' + p.area + '平米\n';
    if (p.price) text += '月租 ¥' + p.price + '\n\n';
    if (p.description) text += p.description;
    if (p.ai_tags) text += '\n\n标签：' + p.ai_tags;
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '房源信息已复制', icon: 'success' }) });
  },

  // 💰 AI智能定价
  async getPriceSuggest() {
    const id = this.data.p.id;
    if (!id) return;
    this.setData({ priceLoading: true, priceSuggest: null, aiResult: '' });
    try {
      const r = await api.post('/properties/' + id + '/price-suggest');
      if (r.code === 0 && r.data) {
        const s = r.data.suggestion || {};
        this.setData({
          priceSuggest: s,
          priceRangeLow: (s.price_range && s.price_range.low) || 0,
          priceRangeHigh: (s.price_range && s.price_range.high) || 0,
          aiResultTitle: '💡 复制定价方案'
        });
        wx.showToast({ title: '定价分析完成', icon: 'success' });
      } else {
        wx.showToast({ title: r.msg || '定价失败', icon: 'none' });
      }
    } catch(e) {
      wx.showToast({ title: '定价分析失败', icon: 'none' });
    }
    this.setData({ priceLoading: false });
  },

  // 📋 复制定价方案
  copyPriceResult() {
    const s = this.data.priceSuggest;
    if (!s) return;
    let text = '【AI智能定价分析】\n建议租金：¥' + s.suggested_price + '/月\n';
    if (s.price_range) text += '建议范围：¥' + s.price_range.low + ' ~ ¥' + s.price_range.high + '\n';
    text += '置信度：' + s.confidence + '\n\n📊 分析理由：\n';
    if (s.reasons) s.reasons.forEach(r => text += '• ' + r + '\n');
    if (s.tips) { text += '\n💡 提升建议：\n'; s.tips.forEach(t => text += '• ' + t + '\n'); }
    text += '\n—— AI安家帮 智能定价';
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '定价方案已复制', icon: 'success' }) });
  },

  // 🖼️ 生成招租海报
  async generatePoster() {
    const id = this.data.p.id;
    if (!id) return;
    this.setData({ posterLoading: true, posterData: null, aiResult: '' });
    try {
      const r = await api.post('/properties/' + id + '/poster');
      if (r.code === 0 && r.data) {
        this.setData({ posterData: r.data.poster });
        wx.showToast({ title: '海报已生成', icon: 'success' });
      } else {
        wx.showToast({ title: r.msg || '生成失败', icon: 'none' });
      }
    } catch(e) {
      wx.showToast({ title: '海报生成失败', icon: 'none' });
    }
    this.setData({ posterLoading: false });
  },

  posterDone() { wx.showToast({ title: '可以截图保存海报分享朋友圈', icon: 'none', duration: 2500 }); },

  closePoster() { this.setData({ posterData: null }); },

  async regeneratePoster() {
    this.setData({ posterData: null });
    await this.generatePoster();
  }
});
