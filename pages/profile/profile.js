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
  }
});
