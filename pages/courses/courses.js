const store = require("../../utils/cloudStore");

const emptyForm = {
  name: "",
  unit: "1"
};

Page({
  data: {
    courses: [],
    editingCourseId: "",
    createForm: { ...emptyForm },
    editForm: { ...emptyForm },
    permissions: {},
    loading: true
  },

  async onShow() {
    await this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const data = await store.getCourses();
      this.setData({
        courses: data.courses || [],
        permissions: data.permissions || {},
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      store.showError(error);
    }
  },

  onCreateInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      [`createForm.${key}`]: event.detail.value
    });
  },

  onEditInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      [`editForm.${key}`]: event.detail.value
    });
  },

  validateForm(form) {
    if (!form.name.trim()) {
      wx.showToast({ title: "请填写课程名称", icon: "none" });
      return false;
    }
    if (Number(form.unit) <= 0) {
      wx.showToast({ title: "课时必须大于 0", icon: "none" });
      return false;
    }
    return true;
  },

  async createCourse() {
    const { createForm } = this.data;
    if (!this.validateForm(createForm)) return;
    try {
      await store.addCourse(createForm);
      this.setData({
        createForm: { ...emptyForm }
      });
      await this.loadData();
      wx.showToast({ title: "已保存" });
    } catch (error) {
      store.showError(error);
    }
  },

  async updateCourse() {
    const { editingCourseId, editForm } = this.data;
    if (!editingCourseId) return;
    if (!this.validateForm(editForm)) return;
    try {
      await store.updateCourse(editingCourseId, editForm);
      this.setData({
        editingCourseId: "",
        editForm: { ...emptyForm }
      });
      await this.loadData();
      wx.showToast({ title: "已修改" });
    } catch (error) {
      store.showError(error);
    }
  },

  startEdit(event) {
    const id = event.currentTarget.dataset.id;
    const course = this.data.courses.find((item) => item.id === id);
    if (!course) return;
    this.setData(
      {
        editingCourseId: id,
        editForm: {
          name: course.name,
          unit: String(course.unit)
        }
      },
      () => {
        wx.pageScrollTo({
          selector: "#course-edit-form",
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
      editingCourseId: "",
      editForm: { ...emptyForm }
    });
  },

  deleteCourse(event) {
    const id = event.currentTarget.dataset.id;
    const course = this.data.courses.find((item) => item.id === id);
    if (!course) return;
    wx.showModal({
      title: "删除课程",
      content: `确认删除课程「${course.name}」？如果已有学员使用该课程，将无法删除。`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await store.deleteCourse(id);
          if (this.data.editingCourseId === id) {
            this.cancelEdit();
          }
          await this.loadData();
          wx.showToast({ title: "已删除" });
        } catch (error) {
          store.showError(error);
        }
      }
    });
  }
});
