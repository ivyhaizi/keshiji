const store = require("../../utils/cloudStore");

Page({
  data: {
    students: [],
    studentNames: [],
    studentIndex: 0,
    courses: [],
    courseNames: [],
    courseIndex: 0,
    selectedStudent: {},
    hours: "1",
    note: "常规上课"
  },

  async onShow() {
    await this.loadData();
  },

  async loadData() {
    try {
      const data = await store.getStudents();
    const studentIndex = Math.min(this.data.studentIndex, Math.max(data.students.length - 1, 0));
    const courseIndex = Math.min(this.data.courseIndex, Math.max(data.courses.length - 1, 0));
    this.setData({
      students: data.students,
      studentNames: data.students.map((student) => student.name),
      studentIndex,
      courses: data.courses,
      courseNames: data.courses.map((course) => course.name),
      courseIndex,
      selectedStudent: data.students[studentIndex] || {}
    });
    } catch (error) {
      store.showError(error);
    }
  },

  onStudentChange(event) {
    const studentIndex = Number(event.detail.value);
    const selectedStudent = this.data.students[studentIndex] || {};
    const courseIndex = Math.max(this.data.courses.findIndex((course) => course.id === selectedStudent.courseId), 0);
    this.setData({ studentIndex, selectedStudent, courseIndex });
  },

  onCourseChange(event) {
    this.setData({ courseIndex: Number(event.detail.value) });
  },

  onHoursInput(event) {
    this.setData({ hours: event.detail.value });
  },

  onNoteInput(event) {
    this.setData({ note: event.detail.value });
  },

  async submitCheckin() {
    const student = this.data.students[this.data.studentIndex];
    const course = this.data.courses[this.data.courseIndex];
    const hours = Number(this.data.hours);
    if (!student || !course) {
      wx.showToast({ title: "请先添加学员", icon: "none" });
      return;
    }
    if (!hours || hours <= 0) {
      wx.showToast({ title: "请填写扣减课时", icon: "none" });
      return;
    }
    if (student.remaining < hours) {
      wx.showToast({ title: "剩余课时不足", icon: "none" });
      return;
    }
    try {
      await store.checkIn(student.id, course.id, hours, this.data.note);
      await this.loadData();
      wx.showToast({ title: "打卡成功" });
    } catch (error) {
      store.showError(error);
    }
  }
});
