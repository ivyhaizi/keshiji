const store = require("../../utils/cloudStore");

Page({
  data: {
    records: []
  },

  async onShow() {
    try {
      const data = await store.getRecords();
      this.setData({
        records: data.records
      });
    } catch (error) {
      store.showError(error);
    }
  }
});
