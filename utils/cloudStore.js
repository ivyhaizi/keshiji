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
        throw new Error(result.message || "云端数据调用失败");
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
  return callApi("courseList");
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

function getMembers() {
  return callApi("memberList");
}

function addMember(member) {
  return callApi("memberCreate", member);
}

function updateMember(memberId, member) {
  return callApi("memberUpdate", { memberId, ...member });
}

function deleteMember(memberId) {
  return callApi("memberDelete", { memberId });
}

function bindMember(inviteCode) {
  return callApi("memberBind", { inviteCode });
}

function createOrg(orgName) {
  return callApi("orgCreate", { orgName });
}

function submitFeedback(feedback) {
  return callApi("feedbackCreate", feedback);
}

function resetDemoData() {
  return callApi("resetDemoData");
}

module.exports = {
  addCourse,
  addMember,
  addStudent,
  bindMember,
  checkIn,
  createOrg,
  deleteCourse,
  deleteMember,
  deleteStudent,
  getCourses,
  getDashboard,
  getMembers,
  getOperationLogs,
  getProfile,
  getRecords,
  getStudents,
  login,
  rechargeStudent,
  resetDemoData,
  showError,
  submitFeedback,
  updateCourse,
  updateMember,
  updateStudent,
  undoRecord
};
