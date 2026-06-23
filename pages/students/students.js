const store = require("../../utils/cloudStore");

const emptyForm = {
  name: "",
  guardian: "",
  phone: "",
  remaining: "20"
};

Page({
  data: {
    courses: [],
    courseNames: [],
    courseIndex: 0,
    students: [],
    permissions: {},
    editingStudentId: "",
    form: { ...emptyForm },
    rechargeDialog: {
      visible: false,
      studentId: "",
      studentName: "",
      courseName: "",
      hours: ""
    }
  },

  async onShow() {
    await this.loadData();
  },

  async loadData() {
    try {
      const data = await store.getStudents();
      const courseMap = (data.courses || []).reduce((map, course) => {
        map[course.id] = course;
        return map;
      }, {});
      this.setData({
        courses: data.courses || [],
        courseNames: (data.courses || []).map((course) => course.name),
        permissions: data.permissions || {},
        students: (data.students || []).map((student) => ({
          ...student,
          courseName: courseMap[student.courseId] ? courseMap[student.courseId].name : "未设置课程",
          courseUnit: courseMap[student.courseId] ? Number(courseMap[student.courseId].unit || 1) : 1
        }))
      });
    } catch (error) {
      store.showError(error);
    }
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      [`form.${key}`]: event.detail.value
    });
  },

  onCourseChange(event) {
    this.setData({
      courseIndex: Number(event.detail.value)
    });
  },

  async saveStudent() {
    const { editingStudentId, form, courses, courseIndex } = this.data;
    if (!form.name.trim()) {
      wx.showToast({ title: "请填写学员姓名", icon: "none" });
      return;
    }
    if (!courses[courseIndex]) {
      wx.showToast({ title: "课程数据未加载", icon: "none" });
      return;
    }
    try {
      const payload = {
        ...form,
        courseId: courses[courseIndex].id
      };
      if (editingStudentId) {
        await store.updateStudent(editingStudentId, payload);
      } else {
        await store.addStudent(payload);
      }
      this.setData({
        editingStudentId: "",
        form: { ...emptyForm }
      });
      await this.loadData();
      wx.showToast({ title: "已保存" });
    } catch (error) {
      store.showError(error);
    }
  },

  startEdit(event) {
    const id = event.currentTarget.dataset.id;
    const student = this.data.students.find((item) => item.id === id);
    if (!student) return;
    const courseIndex = Math.max(this.data.courses.findIndex((course) => course.id === student.courseId), 0);
    this.setData(
      {
        editingStudentId: id,
        courseIndex,
        form: {
          name: student.name,
          guardian: student.guardian,
          phone: student.phone,
          remaining: String(student.remaining)
        }
      },
      () => {
        wx.pageScrollTo({
          selector: "#student-form",
          duration: 250
        });
        wx.showToast({
          title: "已进入编辑",
          icon: "none"
        });
      }
    );
  },

  cancelEdit() {
    this.setData({
      editingStudentId: "",
      form: { ...emptyForm }
    });
  },

  deleteStudent(event) {
    const id = event.currentTarget.dataset.id;
    const student = this.data.students.find((item) => item.id === id);
    if (!student) return;
    wx.showModal({
      title: "删除学员课程",
      content: `确认删除 ${student.name} · ${student.courseName}？历史课时记录会保留。`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await store.deleteStudent(id);
          if (this.data.editingStudentId === id) {
            this.cancelEdit();
          }
          await this.loadData();
          wx.showToast({ title: "已删除" });
        } catch (error) {
          store.showError(error);
        }
      }
    });
  },

  getStudent(id) {
    return this.data.students.find((item) => item.id === id);
  },

  confirmCheckin(student, options = {}) {
    const hours = Number(student.courseUnit || 1);
    if (student.remaining < hours) {
      wx.showToast({ title: "剩余课时不足", icon: "none" });
      return;
    }
    const dateText = options.classDate ? `\n日期：${options.classDate}` : "";
    wx.showModal({
      title: options.title || "确认打卡",
      content: `${student.name} · ${student.courseName}\n将扣减 ${hours} 课时${dateText}`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await store.checkIn(
            student.id,
            student.courseId,
            hours,
            options.note || "上课打卡",
            options.classDate || ""
          );
          await this.loadData();
          wx.showToast({ title: "打卡成功" });
        } catch (error) {
          store.showError(error);
        }
      }
    });
  },

  todayCheckin(event) {
    const student = this.getStudent(event.currentTarget.dataset.id);
    if (!student) return;
    this.confirmCheckin(student, {
      title: "确认当日打卡",
      note: "当日打卡"
    });
  },

  makeupCheckin(event) {
    const student = this.getStudent(event.currentTarget.dataset.id);
    if (!student) return;
    this.confirmCheckin(student, {
      title: "确认补打卡",
      note: "补打卡",
      classDate: event.detail.value
    });
  },

  noop() {},

  recharge(event) {
    const id = event.currentTarget.dataset.id;
    const student = this.getStudent(id);
    if (!student) return;
    this.setData({
      rechargeDialog: {
        visible: true,
        studentId: student.id,
        studentName: student.name,
        courseName: student.courseName,
        hours: ""
      }
    });
  },

  onRechargeHoursInput(event) {
    this.setData({
      "rechargeDialog.hours": event.detail.value
    });
  },

  cancelRecharge() {
    this.setData({
      rechargeDialog: {
        visible: false,
        studentId: "",
        studentName: "",
        courseName: "",
        hours: ""
      }
    });
  },

  confirmRechargeInput() {
    const dialog = this.data.rechargeDialog;
    const hours = Number(dialog.hours);
    if (!hours || hours <= 0) {
      wx.showToast({ title: "请输入课时数", icon: "none" });
      return;
    }
    wx.showModal({
      title: "确认充课时",
      content: `${dialog.studentName} · ${dialog.courseName}\n将增加 ${hours} 课时`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await store.rechargeStudent(dialog.studentId, hours);
          this.cancelRecharge();
          await this.loadData();
          wx.showToast({ title: "已充值" });
        } catch (error) {
          store.showError(error);
        }
      }
    });
  }
});
