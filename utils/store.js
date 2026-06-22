const STORAGE_KEY = "keshixiaohuoban_demo_data";

const defaultData = {
  courses: [
    { id: "course_piano", name: "钢琴一对一", unit: 1 },
    { id: "course_art", name: "少儿美术", unit: 1 },
    { id: "course_dance", name: "舞蹈小班", unit: 1.5 }
  ],
  students: [
    {
      id: "stu_chenxi",
      name: "陈曦",
      guardian: "陈妈妈",
      phone: "13800000001",
      courseId: "course_piano",
      remaining: 12,
      status: "正常"
    },
    {
      id: "stu_xiaoyu",
      name: "林小雨",
      guardian: "林爸爸",
      phone: "13800000002",
      courseId: "course_art",
      remaining: 8,
      status: "正常"
    }
  ],
  records: [
    {
      id: "rec_seed_1",
      studentId: "stu_chenxi",
      studentName: "陈曦",
      courseName: "钢琴一对一",
      hours: 1,
      type: "checkin",
      note: "常规上课",
      createdAt: "2026-06-20 18:30"
    }
  ]
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureSeedData() {
  const data = wx.getStorageSync(STORAGE_KEY);
  if (!data) {
    wx.setStorageSync(STORAGE_KEY, clone(defaultData));
  }
}

function getData() {
  ensureSeedData();
  return wx.getStorageSync(STORAGE_KEY);
}

function setData(data) {
  wx.setStorageSync(STORAGE_KEY, data);
}

function resetData() {
  wx.setStorageSync(STORAGE_KEY, clone(defaultData));
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function formatDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getCourseMap(data = getData()) {
  return data.courses.reduce((map, course) => {
    map[course.id] = course;
    return map;
  }, {});
}

function addStudent(student) {
  const data = getData();
  const normalized = {
    id: createId("stu"),
    name: student.name,
    guardian: student.guardian || "",
    phone: student.phone || "",
    courseId: student.courseId,
    remaining: Number(student.remaining || 0),
    status: "正常"
  };
  data.students.unshift(normalized);
  setData(data);
  return normalized;
}

function rechargeStudent(studentId, hours) {
  const data = getData();
  const student = data.students.find((item) => item.id === studentId);
  if (!student) return null;
  const value = Number(hours || 0);
  student.remaining = Number((student.remaining + value).toFixed(2));
  data.records.unshift({
    id: createId("rec"),
    studentId: student.id,
    studentName: student.name,
    courseName: "课时充值",
    hours: value,
    type: "recharge",
    note: "手动充值",
    createdAt: formatDate()
  });
  setData(data);
  return student;
}

function checkIn(studentId, courseId, hours, note) {
  const data = getData();
  const student = data.students.find((item) => item.id === studentId);
  const course = data.courses.find((item) => item.id === courseId);
  const value = Number(hours || 0);
  if (!student || !course || value <= 0 || student.remaining < value) {
    return null;
  }
  student.remaining = Number((student.remaining - value).toFixed(2));
  const record = {
    id: createId("rec"),
    studentId: student.id,
    studentName: student.name,
    courseName: course.name,
    hours: value,
    type: "checkin",
    note: note || "上课打卡",
    createdAt: formatDate()
  };
  data.records.unshift(record);
  setData(data);
  return record;
}

function getStats() {
  const data = getData();
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const totalRemaining = data.students.reduce((sum, item) => sum + Number(item.remaining || 0), 0);
  const monthConsumed = data.records
    .filter((record) => record.type === "checkin" && record.createdAt.startsWith(monthPrefix))
    .reduce((sum, record) => sum + Number(record.hours || 0), 0);
  const lowBalance = data.students.filter((item) => Number(item.remaining || 0) <= 3).length;
  return {
    studentCount: data.students.length,
    totalRemaining: Number(totalRemaining.toFixed(2)),
    monthConsumed: Number(monthConsumed.toFixed(2)),
    lowBalance
  };
}

module.exports = {
  addStudent,
  checkIn,
  ensureSeedData,
  getCourseMap,
  getData,
  getStats,
  rechargeStudent,
  resetData
};
