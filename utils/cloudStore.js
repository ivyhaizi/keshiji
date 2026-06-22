function callApi(action, payload = {}) {
  return wx.cloud
    .callFunction({
      name: "api",
      data: {
        action,
        payload
      }
    })
    .then((res) => {
      const result = res.result || {};
      if (!result.ok) {
        throw new Error(result.message || "云函数调用失败");
      }
      return result.data;
    });
}

function showError(error) {
  wx.showToast({
    title: error.message || "操作失败",
    icon: "none"
  });
}

function login() {
  return callApi("login");
}

function getDashboard() {
  return callApi("dashboard");
}

function getStudents() {
  return callApi("studentList");
}

function addStudent(student) {
  return callApi("studentCreate", student);
}

function rechargeStudent(studentId, hours) {
  return callApi("studentRecharge", { studentId, hours });
}

function checkIn(studentId, courseId, hours, note) {
  return callApi("lessonCheckin", { studentId, courseId, hours, note });
}

function getRecords() {
  return callApi("recordList");
}

function getProfile() {
  return callApi("profileGet");
}

function resetDemoData() {
  return callApi("resetDemoData");
}

module.exports = {
  addStudent,
  checkIn,
  getDashboard,
  getProfile,
  getRecords,
  getStudents,
  login,
  rechargeStudent,
  resetDemoData,
  showError
};
