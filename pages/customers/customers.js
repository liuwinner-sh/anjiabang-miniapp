const api = require('../../utils/api');

Page({
  data: {
    list: [],
    filteredList: [],
    refreshing: false,
    filterStatus: 'all',
    // 新增弹窗
    showAdd: false,
    formName: '',
    formPhone: '',
    formDemand: '',
    isAdding: false,
    // AI标签预览
    aiTags: [],
    // 聊天总结弹窗
    showChat: false,
    curCustomer: null,
    chatMessages: '',
    chatSummary: '',
    chatActions: [],
    chatMood: '',
    isSummarizing: false,
    // 自动回复
    replyMsg: '',
    autoReply: ''
  },

  onShow() { this.loadData(); },

  async loadData() {
    try {
      const res = await api.get('/customers');
      const items = res.data || [];
      // 解析ai_tags字符串为数组
      items.forEach(c => {
        c._tags = (c.ai_tags || '').split(',').filter(Boolean);
        c._budget = c.budget_min && c.budget_max ? '¥' + c.budget_min + '-' + c.budget_max : '';
        c._lastContact = c.last_contact ? (c.last_contact || '').slice(0, 10) : '未联系';
        c._statusText = c.status === 'new' ? '新客' : c.status === 'contacted' ? '已联系' : c.status === 'interested' ? '有意向' : c.status === 'deal' ? '已成交' : c.status === 'lost' ? '已流失' : c.status;
        c._statusClass = c.status === 'new' ? 'tag-blue' : c.status === 'contacted' ? 'tag-orange' : c.status === 'interested' ? 'tag-green' : 'tag-gray';
      });
      this.setData({ list: items });
      this.filterList();
    } catch(e) { console.error(e); }
  },

  onRefresh() { this.setData({ refreshing: true }); this.loadData().then(() => this.setData({ refreshing: false })); },

  // ---- 筛选 ----
  filterBy(e) {
    this.setData({ filterStatus: e.currentTarget.dataset.status || 'all' });
    this.filterList();
  },

  filterList() {
    const s = this.data.filterStatus;
    this.setData({
      filteredList: s === 'all' ? this.data.list : this.data.list.filter(c => c.status === s)
    });
  },

  // ---- 新增客户（AI自动打标签） ----
  openAdd() {
    this.setData({ showAdd: true, formName: '', formPhone: '', formDemand: '', aiTags: [] });
  },
  closeAdd() { this.setData({ showAdd: false }); },
  onName(e) { this.setData({ formName: e.detail.value }); },
  onPhone(e) { this.setData({ formPhone: e.detail.value }); },
  onDemand(e) { this.setData({ formDemand: e.detail.value }); },

  async doAdd() {
    if (!this.data.formName && !this.data.formPhone) {
      wx.showToast({ title: '请输入姓名或电话', icon: 'none' });
      return;
    }
    this.setData({ isAdding: true });
    try {
      const res = await api.post('/customers', {
        name: this.data.formName,
        phone: this.data.formPhone,
        demand: this.data.formDemand
      });
      if (res.success) {
        wx.showToast({
          title: '添加成功！AI标签：' + (res.ai_tags || []).join('、'),
          icon: 'none',
          duration: 3000
        });
        this.setData({ showAdd: false, isAdding: false });
        this.loadData();
      } else {
        wx.showToast({ title: res.error || '添加失败', icon: 'none' });
        this.setData({ isAdding: false });
      }
    } catch(e) {
      wx.showToast({ title: '添加失败', icon: 'none' });
      this.setData({ isAdding: false });
    }
  },

  // ---- AI聊天总结 ----
  async openChat(e) {
    const id = e.currentTarget.dataset.id;
    const customer = this.data.list.find(c => c.id === id);
    if (!customer) return;
    this.setData({
      showChat: true,
      curCustomer: customer,
      chatMessages: '',
      chatSummary: customer.conversation_summary || '',
      chatActions: [],
      chatMood: '',
      autoReply: '',
      replyMsg: ''
    });
    if (customer.conversation_summary) {
      // 已有总结
      this.setData({ chatSummary: customer.conversation_summary });
    }
  },

  closeChat() { this.setData({ showChat: false }); },

  onChatInput(e) { this.setData({ chatMessages: e.detail.value }); },

  async doSummarize() {
    if (!this.data.chatMessages || this.data.chatMessages.length < 10) {
      wx.showToast({ title: '请至少输入10个字的聊天内容', icon: 'none' });
      return;
    }
    this.setData({ isSummarizing: true });
    try {
      const res = await api.post('/customers/' + this.data.curCustomer.id + '/chat-summary', {
        messages: this.data.chatMessages
      });
      if (res.success) {
        this.setData({
          chatSummary: res.summary,
          chatActions: res.action_items || [],
          chatMood: res.mood || '中性',
          isSummarizing: false
        });
      } else {
        wx.showToast({ title: '分析失败', icon: 'none' });
        this.setData({ isSummarizing: false });
      }
    } catch(e) {
      wx.showToast({ title: '分析失败', icon: 'none' });
      this.setData({ isSummarizing: false });
    }
  },

  // ---- AI自动回复 ----
  onReplyInput(e) { this.setData({ replyMsg: e.detail.value }); },

  async doAutoReply() {
    if (!this.data.replyMsg) {
      wx.showToast({ title: '请输入客户消息', icon: 'none' });
      return;
    }
    wx.showLoading({ title: 'AI生成回复...' });
    try {
      const res = await api.post('/customers/auto-reply', {
        customer_message: this.data.replyMsg,
        customer_name: this.data.curCustomer?.name || ''
      });
      wx.hideLoading();
      if (res.success) {
        this.setData({ autoReply: res.reply });
      } else {
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    } catch(e) {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  copyReply() {
    wx.setClipboardData({
      data: this.data.autoReply,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
    });
  },

  goBack() { wx.navigateBack(); }
});
