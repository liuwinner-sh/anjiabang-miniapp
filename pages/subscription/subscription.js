const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    refreshing: false,
    plans: [],
    currentPlan: {},
    usageStats: [],
    showConfirm: false,
    selectedPlan: null,
    upgrading: false,
    featureNames: {
      'ai_desc': 'AI房源描述',
      'ai_pricing': 'AI智能定价',
      'ai_poster': '招租海报',
      'ai_distribute': '多平台分发',
      'ai_chat': 'AI聊天总结',
      'ai_repair': 'AI维修诊断',
      'ai_contract': 'AI生成合同',
      'ai_match': '智能配盘'
    }
  },

  onShow() { this.loadData(); },

  async loadData() {
    this.setData({ refreshing: true });
    try {
      const [planRes, statusRes, usageRes] = await Promise.all([
        api.get('/subscription/plans'),
        api.get('/subscription/status'),
        api.get('/subscription/usage/stats')
      ]);
      const plans = planRes.data || [];
      const currentPlan = statusRes.data || { plan: 'free', monthly_limit: 3, used_this_month: 0 };
      const usageData = usageRes.data || {};
      const usageStats = usageData.usage || [];
      
      const used = currentPlan.used_this_month || 0;
      const limit = currentPlan.monthly_limit || 3;
      const usagePct = Math.min(100, Math.round(used / limit * 100));
      
      this.setData({
        plans,
        currentPlan,
        usageStats,
        usagePct,
        currentPlanName: this.getPlanName(currentPlan.plan),
        usageDesc: used > 0 ? `本月已使用 ${used} 次 AI 功能` : '选择一个套餐开始使用 AI 功能',
        refreshing: false
      });
    } catch(e) {
      console.error(e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ refreshing: false });
    }
  },

  getPlanName(planId) {
    const names = {
      free: '免费版', basic: '基础版', pro: '专业版',
      enterprise: '企业版', landlord_basic: '房东基础版', landlord_pro: '房东管家版'
    };
    return names[planId] || planId || '免费版';
  },

  selectPlan(e) {
    const planId = e.currentTarget.dataset.plan;
    const plan = this.data.plans.find(p => p.id === planId);
    if (!plan) return;
    if (planId === this.data.currentPlan.plan) {
      wx.showToast({ title: '当前已是此套餐', icon: 'none' });
      return;
    }
    this.setData({ selectedPlan: plan, showConfirm: true });
  },

  closeConfirm() { this.setData({ showConfirm: false, selectedPlan: null }); },

  async doUpgrade() {
    const plan = this.data.selectedPlan;
    if (!plan) return;
    this.setData({ upgrading: true });
    try {
      const res = await api.post('/subscription/upgrade', { plan: plan.id });
      this.setData({ showConfirm: false, upgrading: false, selectedPlan: null });
      if (res.success) {
        wx.showToast({ title: '✅ ' + (res.message || '升级成功'), icon: 'none', duration: 3000 });
        this.loadData();
      } else {
        wx.showToast({ title: res.error || '升级失败', icon: 'none' });
      }
    } catch(e) {
      this.setData({ upgrading: false });
      wx.showToast({ title: '升级失败', icon: 'none' });
    }
  },

  // ---- 工具 ----
  goBack() { wx.navigateBack(); }
});
