const config = require("./utils/config");

App({
  onLaunch() {
    if (wx.cloud) {
      const options = { traceUser: true };
      if (config.cloudEnv) {
        options.env = config.cloudEnv;
      }
      wx.cloud.init(options);
    } else {
      wx.showModal({
        title: "云开发不可用",
        content: "请使用支持云开发的微信开发者工具基础库。",
        showCancel: false
      });
    }
  }
});
