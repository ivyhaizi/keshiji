const store = require("../../utils/cloudStore");

Page({
  data: {
    profile: {
      org: {
        name: "课时小伙伴演示机构"
      },
      totals: {
        studentCount: 0,
        recordCount: 0
      }
    }
  },

  async onShow() {
    try {
      const profile = await store.getProfile();
      this.setData({ profile });
    } catch (error) {
      store.showError(error);
    }
  },

  async previewExport() {
    try {
      const profile = await store.getProfile();
      wx.showModal({
        title: "备份预览",
        content: `学员 ${profile.totals.studentCount} 人，流水 ${profile.totals.recordCount} 条。正式版可导出 CSV/Excel 并自动备份到云端。`,
        showCancel: false
      });
    } catch (error) {
      store.showError(error);
    }
  },

  showRoadmap() {
    wx.showModal({
      title: "家校协同",
      content: "后续可支持家长绑定学员、查看剩余课时、接收消课通知和课堂点评。",
      showCancel: false
    });
  },

  resetData() {
    wx.showModal({
      title: "确认重置",
      content: "将清空当前云端演示数据，并恢复初始演示数据。",
      success: async (res) => {
        if (res.confirm) {
          try {
            await store.resetDemoData();
            await this.onShow();
            wx.showToast({ title: "已重置" });
          } catch (error) {
            store.showError(error);
          }
        }
      }
    });
  }
});
