const store = require("../../utils/cloudStore");

Page({
  data: {
    stats: {},
    recentRecords: []
  },

  async onShow() {
    try {
      const data = await store.getDashboard();
      this.setData({
        stats: data.stats,
        recentRecords: data.recentRecords
      });
    } catch (error) {
      store.showError(error);
    }
  },

  goCheckin() {
    wx.switchTab({ url: "/pages/checkin/checkin" });
  },

  goStudents() {
    wx.switchTab({ url: "/pages/students/students" });
  }
});
