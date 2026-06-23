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

function getCourses() {
  return callApi("studentList").then((data) => ({
    courses: data.courses || []
  }));
}

function addStudent(student) {
  return callApi("studentCreate", student);
}

function addCourse(course) {
  return callApi("courseCreate", course);
}

function updateCourse(courseId, course) {
  return callApi("courseUpdate", { courseId, ...course });
}

function deleteCourse(courseId) {
  return callApi("courseDelete", { courseId });
}

function updateStudent(studentId, student) {
  return callApi("studentUpdate", { studentId, ...student });
}

function deleteStudent(studentId) {
  return callApi("studentDelete", { studentId });
}

function rechargeStudent(studentId, hours) {
  return callApi("studentRecharge", { studentId, hours });
}

function checkIn(studentId, courseId, hours, note, classDate) {
  return callApi("lessonCheckin", { studentId, courseId, hours, note, classDate });
}

function getRecords(filters = {}) {
  return callApi("recordList", filters);
}

function undoRecord(recordId) {
  return callApi("recordUndo", { recordId });
}

function getOperationLogs() {
  return callApi("operationLogList");
}

function getProfile() {
  return callApi("profileGet");
}

function resetDemoData() {
  return callApi("resetDemoData");
}

module.exports = {
  addCourse,
  addStudent,
  checkIn,
  deleteCourse,
  deleteStudent,
  getCourses,
  getDashboard,
  getProfile,
  getOperationLogs,
  getRecords,
  getStudents,
  login,
  rechargeStudent,
  resetDemoData,
  showError,
  updateCourse,
  updateStudent,
  undoRecord
};
