const store = require("../../utils/cloudStore");

Page({
  data: {
    records: [],
    students: [],
    studentNames: ["全部学员"],
    studentIndex: 0,
    courses: [],
    courseNames: ["全部课程"],
    courseIndex: 0,
    filterDate: "",
    logs: [],
    permissions: {}
  },

  async onShow() {
    await this.loadOptions();
    await Promise.all([this.loadRecords(), this.loadLogs()]);
  },

  async loadOptions() {
    try {
      const data = await store.getStudents();
      this.setData({
        students: data.students || [],
        studentNames: ["全部学员"].concat((data.students || []).map((student) => student.name)),
        courses: data.courses || [],
        courseNames: ["全部课程"].concat((data.courses || []).map((course) => course.name)),
        permissions: data.permissions || {}
      });
    } catch (error) {
      store.showError(error);
    }
  },

  getFilters() {
    const student = this.data.students[this.data.studentIndex - 1];
    const course = this.data.courses[this.data.courseIndex - 1];
    return {
      studentId: student ? student.id : "",
      courseId: course ? course.id : "",
      date: this.data.filterDate
    };
  },

  async loadRecords() {
    try {
      const data = await store.getRecords(this.getFilters());
      this.setData({
        permissions: data.permissions || this.data.permissions,
        records: (data.records || []).map((record) => ({
          ...record,
          typeText: this.getRecordTypeText(record.type),
          status: record.status || "active",
          canUndo:
            record.canUndo !== undefined
              ? record.canUndo
              : ["checkin", "recharge"].includes(record.type) && record.status !== "undone",
          statusText: this.getRecordStatusText(record)
        }))
      });
    } catch (error) {
      store.showError(error);
    }
  },

  async loadLogs() {
    if (!this.data.permissions.canViewLogs) {
      this.setData({ logs: [] });
      return;
    }
    try {
      const data = await store.getOperationLogs();
      this.setData({
        permissions: data.permissions || this.data.permissions,
        logs: (data.logs || []).map((log) => ({
          ...log,
          actionText: this.getActionText(log.action)
        }))
      });
    } catch (error) {
      this.setData({ logs: [] });
    }
  },

  getRecordTypeText(type) {
    const typeMap = {
      checkin: "打卡",
      recharge: "充值",
      undo_checkin: "撤销打卡",
      undo_recharge: "撤销充值"
    };
    return typeMap[type] || "记录";
  },

  getRecordStatusText(record) {
    if (record.status === "undone") return "已撤销";
    if (["checkin", "recharge"].includes(record.type)) return record.canUndo ? "可撤销" : "已生效";
    return "追溯记录";
  },

  getActionText(action) {
    const actionMap = {
      course_create: "新增课程",
      course_update: "修改课程",
      course_delete: "删除课程",
      lesson_checkin: "打卡",
      member_create: "新增成员",
      member_update: "修改成员",
      member_delete: "删除成员",
      student_create: "新增学员",
      student_update: "修改学员",
      student_delete: "删除学员",
      student_recharge: "充值",
      lesson_record_undo: "撤销记录"
    };
    return actionMap[action] || action || "操作";
  },

  async onStudentFilterChange(event) {
    this.setData({ studentIndex: Number(event.detail.value) });
    await this.loadRecords();
  },

  async onCourseFilterChange(event) {
    this.setData({ courseIndex: Number(event.detail.value) });
    await this.loadRecords();
  },

  async onDateFilterChange(event) {
    this.setData({ filterDate: event.detail.value });
    await this.loadRecords();
  },

  async clearFilters() {
    this.setData({
      studentIndex: 0,
      courseIndex: 0,
      filterDate: ""
    });
    await this.loadRecords();
  },

  undoRecord(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    wx.showModal({
      title: record.type === "recharge" ? "撤销充值" : "撤销打卡",
      content: `确认撤销 ${record.studentName} · ${record.courseName} 的这条记录？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await store.undoRecord(id);
          await Promise.all([this.loadRecords(), this.loadLogs()]);
          wx.showToast({ title: "已撤销" });
        } catch (error) {
          store.showError(error);
        }
      }
    });
  }
});
