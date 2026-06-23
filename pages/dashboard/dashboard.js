const store = require("../../utils/cloudStore");

Page({
  data: {
    stats: {},
    recentRecords: [],
    permissions: {}
  },

  async onShow() {
    try {
      const data = await store.getDashboard();
      this.setData({
        stats: data.stats,
        recentRecords: data.recentRecords,
        permissions: data.permissions || {}
      });
    } catch (error) {
      store.showError(error);
    }
  },

  goStudents() {
    wx.switchTab({ url: "/pages/students/students" });
  },

  goCourses() {
    wx.switchTab({ url: "/pages/courses/courses" });
  }
});
