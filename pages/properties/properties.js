const api = require('../../utils/api');
Page({
  data: { refreshing: false, keyword: '', list: [], allProps: [] },
  onShow() { this.loadData(); },
  onRefresh() { this.setData({ refreshing: true }); this.loadData().then(() => this.setData({ refreshing: false })); },
  async loadData() {
    try {
      const res = await api.get('/properties/my?page=1&pageSize=100');
      const list = res.data?.list || res.data || [];
      this.setData({ allProps: list });
      this.filter();
    } catch(e) { console.error(e); }
  },
  onSearch(e) { this.setData({ keyword: e.detail.value }); this.filter(); },
  filter() {
    const kw = this.data.keyword;
    const list = this.data.allProps.filter(p => !kw || (p.name || '').includes(kw) || (p.address || '').includes(kw));
    this.setData({ list });
  },
  viewDetail(e) { wx.navigateTo({ url: '/pages/property-detail/property-detail?id=' + e.currentTarget.dataset.id }); },
  addProperty() { wx.navigateTo({ url: '/pages/property-detail/property-detail?id=0' }); }
});
