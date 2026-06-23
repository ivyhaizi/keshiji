const store = require("../../utils/cloudStore");

const roleOptions = [
  { label: "管理员", value: "admin" },
  { label: "老师", value: "teacher" },
  { label: "家长", value: "parent" }
];

const emptyMemberForm = {
  displayName: "",
  phone: "",
  roleIndex: 1,
  studentIndex: 0
};

const emptyFeedbackForm = {
  content: "",
  contact: ""
};

Page({
  data: {
    profile: {
      org: {
        name: "未加入机构"
      },
      roleName: "未加入机构",
      membership: {
        displayName: "未绑定"
      },
      boundStudents: [],
      permissions: {},
      unbound: true
    },
    roleNames: roleOptions.map((role) => role.label),
    students: [],
    studentNames: [],
    members: [],
    editingMemberId: "",
    memberForm: { ...emptyMemberForm },
    inviteCode: "",
    orgName: "课时小伙伴",
    feedbackDialogVisible: false,
    feedbackForm: { ...emptyFeedbackForm }
  },

  async onShow() {
    await this.loadData();
  },

  async loadData() {
    try {
      const profile = await store.getProfile();
      this.setData({ profile });
      if (profile.permissions && profile.permissions.canManageMembers) {
        await this.loadStudents();
        await this.loadMembers();
      } else {
        this.setData({
          students: [],
          studentNames: [],
          members: [],
          editingMemberId: "",
          memberForm: { ...emptyMemberForm }
        });
      }
    } catch (error) {
      store.showError(error);
    }
  },

  async loadMembers() {
    const data = await store.getMembers();
    this.setData({
      members: (data.members || []).map((member) => ({
        ...member,
        boundStudentNames: this.getBoundStudentNames(member.studentIds || [])
      }))
    });
  },

  async loadStudents() {
    const data = await store.getStudents();
    const students = data.students || [];
    const courseMap = (data.courses || []).reduce((map, course) => {
      map[course.id] = course.name;
      return map;
    }, {});
    const decoratedStudents = students.map((student) => ({
      ...student,
      displayName: `${student.name} - ${courseMap[student.courseId] || "未设置课程"}`
    }));
    this.setData({
      students: decoratedStudents,
      studentNames: decoratedStudents.map((student) => student.displayName)
    });
  },

  getBoundStudentNames(studentIds) {
    const studentMap = this.data.students.reduce((map, student) => {
      map[student.id] = student.displayName || student.name;
      return map;
    }, {});
    return studentIds.map((id) => studentMap[id]).filter(Boolean).join("、");
  },

  onMemberInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      [`memberForm.${key}`]: event.detail.value
    });
  },

  onInviteCodeInput(event) {
    this.setData({
      inviteCode: event.detail.value
    });
  },

  onOrgNameInput(event) {
    this.setData({
      orgName: event.detail.value
    });
  },

  onRoleChange(event) {
    this.setData({
      "memberForm.roleIndex": Number(event.detail.value)
    });
  },

  onStudentChange(event) {
    this.setData({
      "memberForm.studentIndex": Number(event.detail.value)
    });
  },

  buildMemberPayload() {
    const form = this.data.memberForm;
    const role = roleOptions[form.roleIndex] || roleOptions[1];
    const selectedStudent = this.data.students[form.studentIndex];
    return {
      displayName: form.displayName,
      phone: form.phone,
      role: role.value,
      studentIds: role.value === "parent" && selectedStudent ? [selectedStudent.id] : []
    };
  },

  async saveMember() {
    const payload = this.buildMemberPayload();
    if (!payload.displayName.trim()) {
      wx.showToast({ title: "请填写成员姓名", icon: "none" });
      return;
    }
    if (payload.role === "parent" && payload.studentIds.length === 0) {
      wx.showToast({ title: "请选择绑定学员", icon: "none" });
      return;
    }
    try {
      if (this.data.editingMemberId) {
        await store.updateMember(this.data.editingMemberId, payload);
      } else {
        await store.addMember(payload);
      }
      this.cancelMemberEdit();
      await this.loadMembers();
      wx.showToast({ title: "已保存" });
    } catch (error) {
      store.showError(error);
    }
  },

  startMemberEdit(event) {
    const id = event.currentTarget.dataset.id;
    const member = this.data.members.find((item) => item.id === id);
    if (!member) return;
    const roleIndex = Math.max(roleOptions.findIndex((role) => role.value === member.role), 0);
    const studentIndex = Math.max(
      this.data.students.findIndex((student) => (member.studentIds || []).includes(student.id)),
      0
    );
    this.setData({
      editingMemberId: id,
      memberForm: {
        displayName: member.displayName,
        phone: member.phone,
        roleIndex,
        studentIndex
      }
    });
  },

  cancelMemberEdit() {
    this.setData({
      editingMemberId: "",
      memberForm: { ...emptyMemberForm }
    });
  },

  copyInviteCode(event) {
    const inviteCode = event.currentTarget.dataset.code;
    if (!inviteCode) {
      wx.showToast({ title: "暂无绑定码", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: inviteCode,
      success: () => {
        wx.showToast({ title: "已复制" });
      }
    });
  },

  deleteMember(event) {
    const id = event.currentTarget.dataset.id;
    const member = this.data.members.find((item) => item.id === id);
    if (!member) return;
    wx.showModal({
      title: "删除成员",
      content: `确认删除成员「${member.displayName}」？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await store.deleteMember(id);
          if (this.data.editingMemberId === id) {
            this.cancelMemberEdit();
          }
          await this.loadMembers();
          wx.showToast({ title: "已删除" });
        } catch (error) {
          store.showError(error);
        }
      }
    });
  },

  async bindMember() {
    const inviteCode = this.data.inviteCode.trim();
    if (!inviteCode) {
      wx.showToast({ title: "请输入绑定码", icon: "none" });
      return;
    }
    wx.showModal({
      title: "加入机构",
      content: "绑定后将切换到绑定码对应的机构和角色，确认继续？",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await store.bindMember(inviteCode);
          this.setData({ inviteCode: "" });
          await this.loadData();
          wx.showToast({ title: "已绑定" });
        } catch (error) {
          store.showError(error);
        }
      }
    });
  },

  async createOrg() {
    const orgName = this.data.orgName.trim() || "课时小伙伴";
    wx.showModal({
      title: "创建新机构",
      content: `确认创建机构「${orgName}」并成为管理员？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await store.createOrg(orgName);
          await this.loadData();
          wx.showToast({ title: "已创建" });
        } catch (error) {
          store.showError(error);
        }
      }
    });
  },

  openFeedbackDialog() {
    this.setData({
      feedbackDialogVisible: true
    });
  },

  closeFeedbackDialog() {
    this.setData({
      feedbackDialogVisible: false,
      feedbackForm: { ...emptyFeedbackForm }
    });
  },

  noop() {},

  onFeedbackInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      [`feedbackForm.${key}`]: event.detail.value
    });
  },

  async submitFeedback() {
    const content = this.data.feedbackForm.content.trim();
    const contact = this.data.feedbackForm.contact.trim();
    if (!content) {
      wx.showToast({ title: "请输入反馈内容", icon: "none" });
      return;
    }
    try {
      await store.submitFeedback({ content, contact });
      this.closeFeedbackDialog();
      wx.showToast({ title: "已提交" });
    } catch (error) {
      store.showError(error);
    }
  }
});
