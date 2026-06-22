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
    form: { ...emptyForm }
  },

  async onShow() {
    await this.loadData();
  },

  async loadData() {
    try {
      const data = await store.getStudents();
      const courseMap = data.courses.reduce((map, course) => {
        map[course.id] = course;
        return map;
      }, {});
      this.setData({
        courses: data.courses,
        courseNames: data.courses.map((course) => course.name),
        students: data.students.map((student) => ({
          ...student,
          courseName: courseMap[student.courseId] ? courseMap[student.courseId].name : "未设置课程"
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

  async addStudent() {
    const { form, courses, courseIndex } = this.data;
    if (!form.name.trim()) {
      wx.showToast({ title: "请填写学员姓名", icon: "none" });
      return;
    }
    if (!courses[courseIndex]) {
      wx.showToast({ title: "课程数据未加载", icon: "none" });
      return;
    }
    try {
      await store.addStudent({
        ...form,
        courseId: courses[courseIndex].id
      });
      this.setData({ form: { ...emptyForm } });
      await this.loadData();
      wx.showToast({ title: "已保存" });
    } catch (error) {
      store.showError(error);
    }
  },

  async recharge(event) {
    const id = event.currentTarget.dataset.id;
    try {
      await store.rechargeStudent(id, 10);
      await this.loadData();
      wx.showToast({ title: "已充值" });
    } catch (error) {
      store.showError(error);
    }
  }
});
